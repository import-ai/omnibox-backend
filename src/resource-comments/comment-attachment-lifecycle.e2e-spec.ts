import { randomUUID } from 'node:crypto';

import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { StorageUsages1768556182000 } from 'omniboxd/migrations/1768556182000-storage-usages';
import { AddResourceComments1788162671606 } from 'omniboxd/migrations/1788162671606-add-resource-comments';
import { AddResourceCommentAttachments1788345621847 } from 'omniboxd/migrations/1788345621847-add-resource-comment-attachments';
import { AllowMultipleCommentThreadsAtAnchor1788941872300 } from 'omniboxd/migrations/1788941872300-allow-multiple-comment-threads-at-anchor';
import { AccountCommentAttachments1789383186349 } from 'omniboxd/migrations/1789383186349-account-comment-attachments';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { S3Service } from 'omniboxd/s3/s3.service';
import { StorageUsage } from 'omniboxd/storage-usages/entities/storage-usage.entity';
import { StorageUsagesService } from 'omniboxd/storage-usages/storage-usages.service';
import { Readable } from 'stream';
import { commentPng } from 'test/comment-image-fixture';
import { getTestPostgresUrl } from 'test/migration-test-utils';
import { DataSource, EntitySchema, IsNull, SelectQueryBuilder } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

import { CommentAttachmentCleanupService } from './comment-attachment-cleanup.service';
import { ResourceCommentAttachment } from './entities/resource-comment-attachment.entity';
import { ResourceCommentAttachmentsService } from './resource-comment-attachments.service';

// Only the columns exercised by these services; the schema itself is created by
// production migrations, without booting unrelated external integrations.
const attachmentSchema = new EntitySchema<ResourceCommentAttachment>({
  name: 'ResourceCommentAttachment',
  target: ResourceCommentAttachment,
  tableName: 'resource_comment_attachments',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    namespaceId: { type: String },
    resourceId: { type: String },
    uploaderId: { type: 'uuid', nullable: true },
    storageUserId: { type: 'uuid', nullable: true },
    uploadedAt: { type: 'timestamptz', nullable: true },
    commentId: { type: 'uuid', nullable: true },
    objectKey: { type: String },
    name: { type: String },
    mimetype: { type: String },
    size: { type: Number },
    createdAt: { type: 'timestamptz', createDate: true },
    updatedAt: { type: 'timestamptz', updateDate: true },
    deletedAt: { type: 'timestamptz', nullable: true, deleteDate: true },
  },
});

describe('comment attachment accounting and reclamation (PostgreSQL)', () => {
  const schema = `comment_test_${randomUUID().replaceAll('-', '')}`;
  const userId = randomUUID();
  const threadId = randomUUID();
  const commentId = randomUUID();
  const legacyId = randomUUID();
  let database: DataSource;
  let service: ResourceCommentAttachmentsService;
  let cleanup: CommentAttachmentCleanupService;
  const objects = new Map<string, Buffer>();
  const deleteObject = jest.fn((key: string) => {
    objects.delete(key);
    return Promise.resolve();
  });
  const putObject = jest.fn((key: string, bytes: Buffer) => {
    objects.set(key, bytes);
    return Promise.resolve();
  });

  const upload = () =>
    service.uploadAttachment('namespace', 'resource', userId, {
      fieldname: 'file',
      originalname: 'image.png',
      mimetype: 'image/png',
      encoding: '7bit',
      buffer: commentPng,
      size: commentPng.length,
      stream: Readable.from(commentPng),
      filename: '',
      destination: '',
      path: '',
    });
  const usage = async () => {
    const rows: Array<{ amount: string }> = await database.query(
      "SELECT amount FROM storage_usages WHERE namespace_id = 'namespace' AND user_id = $1 AND storage_type = 'attachment' AND deleted_at IS NULL",
      [userId],
    );
    return Number(rows[0]?.amount ?? 0);
  };
  const expire = (id: string) =>
    database.query(
      "UPDATE resource_comment_attachments SET updated_at = now() - interval '25 hours' WHERE id = $1",
      [id],
    );

  const cleanupAfterCandidateRead = () => {
    let candidateRead = () => {};
    const selected = new Promise<void>((resolve) => {
      candidateRead = resolve;
    });
    const spy = jest
      .spyOn(SelectQueryBuilder.prototype, 'getMany')
      .mockImplementationOnce(async function (
        this: SelectQueryBuilder<ResourceCommentAttachment>,
      ) {
        spy.mockRestore();
        const result = await this.getMany();
        candidateRead();
        return result;
      });
    const complete = cleanup.cleanup().finally(() => spy.mockRestore());
    return { selected, complete };
  };

  beforeAll(async () => {
    database = new DataSource({
      type: 'postgres',
      url: getTestPostgresUrl(),
      schema,
      extra: { options: `-c search_path=${schema},public` },
      entities: [attachmentSchema, StorageUsage],
      namingStrategy: new SnakeNamingStrategy(),
    });
    await database.initialize();
    await database.query(`CREATE SCHEMA "${schema}"`);
    await database.query(
      'CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public',
    );
    await database.query(`
      CREATE TABLE users (id uuid PRIMARY KEY);
      CREATE TABLE namespaces (id varchar PRIMARY KEY);
      CREATE TABLE resources (id varchar PRIMARY KEY, namespace_id varchar, user_id uuid, parent_id varchar,
        deleted_at timestamptz, permanent_deleted_at timestamptz);
      CREATE TABLE namespace_members (namespace_id varchar, user_id uuid, role varchar, created_at timestamptz, deleted_at timestamptz);
    `);
    await database.query('INSERT INTO users VALUES ($1)', [userId]);
    await database.query("INSERT INTO namespaces VALUES ('namespace')");
    await database.query(
      "INSERT INTO resources (id, namespace_id, user_id) VALUES ('resource', 'namespace', $1)",
      [userId],
    );
    const runner = database.createQueryRunner();
    try {
      await new StorageUsages1768556182000().up(runner);
      await new AddResourceComments1788162671606().up(runner);
      await new AddResourceCommentAttachments1788345621847().up(runner);
      await new AllowMultipleCommentThreadsAtAnchor1788941872300().up(runner);
      await database.query(
        `INSERT INTO resource_comment_attachments
        (id, namespace_id, resource_id, uploader_id, object_key, name, mimetype, size)
        VALUES ($1, 'namespace', 'resource', $2, 'legacy', 'legacy.png', 'image/png', 12)`,
        [legacyId, userId],
      );
      await runner.startTransaction();
      await new AccountCommentAttachments1789383186349().up(runner);
      await runner.commitTransaction();
    } finally {
      if (runner.isTransactionActive) {
        await runner.rollbackTransaction();
      }
      await runner.release();
    }
    const module = await Test.createTestingModule({
      providers: [
        ResourceCommentAttachmentsService,
        CommentAttachmentCleanupService,
        StorageUsagesService,
        {
          provide: getRepositoryToken(ResourceCommentAttachment),
          useValue: database.getRepository(ResourceCommentAttachment),
        },
        {
          provide: getRepositoryToken(StorageUsage),
          useValue: database.getRepository(StorageUsage),
        },
        {
          provide: PermissionsService,
          useValue: { userHasPermissionOrFail: () => Promise.resolve() },
        },
        {
          provide: S3Service,
          useValue: {
            generateObjectKey: () =>
              Promise.resolve({ objectKey: randomUUID() }),
            putObject,
            deleteObject,
          },
        },
        { provide: I18nService, useValue: { t: (key: string) => key } },
      ],
    }).compile();
    service = module.get(ResourceCommentAttachmentsService);
    cleanup = module.get(CommentAttachmentCleanupService);
  });

  afterAll(async () => {
    if (database?.isInitialized) {
      await database.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await database.destroy();
    }
  });

  it('backfills historical charges without claiming that their MIME was verified', async () => {
    expect(await usage()).toBe(12);
    const attachment = await database
      .getRepository(ResourceCommentAttachment)
      .findOneByOrFail({ id: legacyId });
    expect(attachment.storageUserId).toBe(userId);
    expect(attachment.uploadedAt).toBeNull();
    await expire(legacyId);
    await cleanup.cleanup();
    expect(await usage()).toBe(0);
  });

  it('records concurrent uploads exactly once and refunds expired drafts exactly once', async () => {
    const images = await Promise.all([upload(), upload()]);
    expect(await usage()).toBe(2 * commentPng.length);
    await Promise.all(images.map((image) => expire(image.id)));
    await Promise.all([cleanup.cleanup(), cleanup.cleanup()]);
    expect(await usage()).toBe(0);
    expect(
      await database.getRepository(ResourceCommentAttachment).count(),
    ).toBe(0);
  });

  it('does not clean a draft that was bound before cleanup obtains its lock', async () => {
    await database.query(
      `INSERT INTO resource_comment_threads
      (id, namespace_id, resource_id, creator_id, quoted_text, anchor_from, anchor_to, content_hash)
      VALUES ($1, 'namespace', 'resource', $2, 'quote', 1, 6, 'hash')`,
      [threadId, userId],
    );
    await database.query(
      "INSERT INTO resource_comments (id, thread_id, author_id, content) VALUES ($1, $2, $3, 'text')",
      [commentId, threadId, userId],
    );
    const image = await upload();
    await expire(image.id);
    const runner = database.createQueryRunner();
    await runner.startTransaction();
    await service.bindAttachments(
      runner.manager,
      'namespace',
      'resource',
      userId,
      commentId,
      [image.id],
    );
    // Cleanup sees the committed unbound version, then waits for this row lock.
    const pendingCleanup = cleanupAfterCandidateRead();
    await pendingCleanup.selected;
    await runner.commitTransaction();
    await runner.release();
    await pendingCleanup.complete;
    expect(await usage()).toBe(commentPng.length);
    const record = await database
      .getRepository(ResourceCommentAttachment)
      .findOneByOrFail({ id: image.id });
    expect(record.commentId).toBe(commentId);
    await database.query(
      'UPDATE resource_comments SET deleted_at = now() WHERE id = $1',
      [commentId],
    );
    await cleanup.cleanup();
    expect(await usage()).toBe(0);
  });

  it('retries S3 failures without losing the record or prematurely refunding storage', async () => {
    const image = await upload();
    await expire(image.id);
    deleteObject.mockRejectedValueOnce(new Error('Temporary S3 failure'));
    await cleanup.cleanup();
    expect(await usage()).toBe(commentPng.length);
    expect(
      await database.getRepository(ResourceCommentAttachment).count(),
    ).toBe(1);
    await cleanup.cleanup();
    expect(await usage()).toBe(0);
  });

  it('waits for an in-flight upload before removing a permanently deleted resource image', async () => {
    let releaseUpload = () => {};
    let notifyStarted = () => {};
    const started = new Promise<void>((resolve) => {
      notifyStarted = resolve;
    });
    putObject.mockImplementationOnce(
      (key, bytes) =>
        new Promise<void>((resolve) => {
          releaseUpload = () => {
            objects.set(key, bytes);
            resolve();
          };
          notifyStarted();
        }),
    );
    const pendingUpload = upload();
    await started;
    await database.query(
      "UPDATE resources SET permanent_deleted_at = now() WHERE id = 'resource'",
    );
    const pendingCleanup = cleanupAfterCandidateRead();
    await pendingCleanup.selected;
    releaseUpload();
    await pendingUpload;
    await pendingCleanup.complete;
    expect(await usage()).toBe(0);
    expect(
      await database.getRepository(ResourceCommentAttachment).count(),
    ).toBe(0);
    expect(objects.size).toBe(0);
    await database.query(
      "UPDATE resources SET permanent_deleted_at = NULL WHERE id = 'resource'",
    );
  });

  it('retains published images in recoverable trash and reclaims removed images', async () => {
    await database.query(
      'UPDATE resource_comments SET deleted_at = NULL WHERE id = $1',
      [commentId],
    );
    const image = await upload();
    await database.transaction((manager) =>
      service.bindAttachments(
        manager,
        'namespace',
        'resource',
        userId,
        commentId,
        [image.id],
      ),
    );
    await expire(image.id);
    await database.query(
      "UPDATE resources SET deleted_at = now() WHERE id = 'resource'",
    );
    await cleanup.cleanup();
    expect(await usage()).toBe(commentPng.length);
    await database.query(
      "UPDATE resources SET deleted_at = NULL WHERE id = 'resource'",
    );
    const attachment = await database
      .getRepository(ResourceCommentAttachment)
      .findOneByOrFail({ id: image.id });
    await database.transaction((manager) =>
      service.replaceAttachments(
        manager,
        'namespace',
        'resource',
        userId,
        commentId,
        [attachment],
        [],
      ),
    );
    await cleanup.cleanup();
    expect(await usage()).toBe(0);
  });

  it('reclaims interrupted uploads and hard-deleted resource objects', async () => {
    putObject.mockRejectedValueOnce(new Error('Interrupted upload'));
    await expect(upload()).rejects.toThrow('Interrupted upload');
    const record = await database
      .getRepository(ResourceCommentAttachment)
      .findOneByOrFail({ uploadedAt: IsNull() });
    expect(record.uploadedAt).toBeNull();
    await expire(record.id);
    await cleanup.cleanup();
    expect(await usage()).toBe(0);
    await upload();
    await database.query("DELETE FROM resources WHERE id = 'resource'");
    expect(
      await database.getRepository(ResourceCommentAttachment).count(),
    ).toBe(1);
    await cleanup.cleanup();
    expect(await usage()).toBe(0);
  });

  it('rejects rollback without losing attachments or their storage charges', async () => {
    await database.query(
      "INSERT INTO resources (id, namespace_id, user_id) VALUES ('resource', 'namespace', $1)",
      [userId],
    );
    const image = await upload();
    const runner = database.createQueryRunner();
    await runner.startTransaction();
    try {
      await expect(
        new AccountCommentAttachments1789383186349().down(runner),
      ).rejects.toThrow('object cleanup or storage charge records remain');
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
    expect(await usage()).toBe(commentPng.length);
    expect(
      await database
        .getRepository(ResourceCommentAttachment)
        .findOneBy({ id: image.id }),
    ).not.toBeNull();
    await expire(image.id);
    await cleanup.cleanup();
  });

  it('protects legitimate duplicate anchors before any rollback schema changes', async () => {
    await database.query(
      `INSERT INTO resource_comment_threads
      (namespace_id, resource_id, creator_id, quoted_text, anchor_from, anchor_to, content_hash)
      VALUES ('namespace', 'resource', $1, 'quote', 1, 6, 'hash'),
             ('namespace', 'resource', $1, 'quote', 1, 6, 'hash')`,
      [userId],
    );
    for (const migration of [
      new AccountCommentAttachments1789383186349(),
      new AllowMultipleCommentThreadsAtAnchor1788941872300(),
    ]) {
      const runner = database.createQueryRunner();
      await runner.startTransaction();
      try {
        await expect(migration.down(runner)).rejects.toThrow(
          'valid multiple unresolved threads share an anchor',
        );
      } finally {
        await runner.rollbackTransaction();
        await runner.release();
      }
    }
    const rows: Array<{ count: string }> = await database.query(
      'SELECT COUNT(*) FROM resource_comment_threads',
    );
    expect(Number(rows[0].count)).toBe(2);
    // Resolve one test thread through the domain state before testing a compatible rollback.
    await database.query(
      'UPDATE resource_comment_threads SET resolved_at = now() WHERE id = (SELECT id FROM resource_comment_threads LIMIT 1)',
    );
  });

  it('supports down/up for compatible data without double counting storage', async () => {
    const runner = database.createQueryRunner();
    await runner.startTransaction();
    try {
      await new AccountCommentAttachments1789383186349().down(runner);
      await new AllowMultipleCommentThreadsAtAnchor1788941872300().down(runner);
      await new AddResourceCommentAttachments1788345621847().down(runner);
      expect(await runner.hasTable('resource_comment_attachments')).toBe(false);
      await new AddResourceCommentAttachments1788345621847().up(runner);
      await new AllowMultipleCommentThreadsAtAnchor1788941872300().up(runner);
      await new AccountCommentAttachments1789383186349().up(runner);
      await runner.commitTransaction();
    } finally {
      if (runner.isTransactionActive) {
        await runner.rollbackTransaction();
      }
      await runner.release();
    }
    expect(await usage()).toBe(0);
    const image = await upload();
    expect(await usage()).toBe(commentPng.length);
    await expire(image.id);
    await cleanup.cleanup();
    expect(await usage()).toBe(0);
  });
});
