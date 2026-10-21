import { randomUUID } from 'node:crypto';

import { getTestPostgresUrl } from 'test/migration-test-utils';
import { DataSource } from 'typeorm';

import { AddResourceComments1788162671606 } from './1788162671606-add-resource-comments';
import { AllowMultipleCommentThreadsAtAnchor1788941872300 } from './1788941872300-allow-multiple-comment-threads-at-anchor';
import { AddDocumentComments1792575770997 } from './1792575770997-add-document-comments';

describe('document comment migration (PostgreSQL)', () => {
  const schema = `document_comment_test_${randomUUID().replaceAll('-', '')}`;
  const legacyId = randomUUID();
  const documentId = randomUUID();
  let database: DataSource;

  beforeAll(async () => {
    database = new DataSource({
      type: 'postgres',
      url: getTestPostgresUrl(),
      schema,
      extra: { options: `-c search_path=${schema},public` },
    });
    await database.initialize();
    await database.query(`CREATE SCHEMA "${schema}"`);
    await database.query(
      'CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public',
    );
    await database.query(`CREATE TABLE users (id uuid PRIMARY KEY);
      CREATE TABLE namespaces (id varchar PRIMARY KEY);
      CREATE TABLE resources (id varchar PRIMARY KEY);
      INSERT INTO namespaces VALUES ('namespace'); INSERT INTO resources VALUES ('resource');`);
    const runner = database.createQueryRunner();
    try {
      await new AddResourceComments1788162671606().up(runner);
      await new AllowMultipleCommentThreadsAtAnchor1788941872300().up(runner);
      await runner.query(
        `INSERT INTO resource_comment_threads
        (id, namespace_id, resource_id, quoted_text, anchor_from, anchor_to, content_hash)
        VALUES ($1, 'namespace', 'resource', 'legacy quote', 0, 12, $2)`,
        [legacyId, 'a'.repeat(64)],
      );
      await new AddDocumentComments1792575770997().up(runner);
    } finally {
      await runner.release();
    }
  });

  afterAll(async () => {
    if (database?.isInitialized) {
      await database.query(`DROP SCHEMA "${schema}" CASCADE`);
      await database.destroy();
    }
  });

  it('preserves pre-existing inline rows with the inline default', async () => {
    expect(
      (
        await database.query(
          'SELECT * FROM resource_comment_threads WHERE id = $1',
          [legacyId],
        )
      )[0],
    ).toMatchObject({
      type: 'inline',
      quoted_text: 'legacy quote',
      anchor_from: 0,
      anchor_to: 12,
      content_hash: 'a'.repeat(64),
      anchor_status: 'active',
    });
  });

  it('rejects fake document ranges and incomplete inline anchors', async () => {
    await expect(
      database.query(
        `INSERT INTO resource_comment_threads
      (namespace_id, resource_id, type, quoted_text, anchor_from, anchor_to, content_hash)
      VALUES ('namespace', 'resource', 'document', '', 0, 1, $1)`,
        ['a'.repeat(64)],
      ),
    ).rejects.toThrow('ck_resource_comment_threads_type_anchor');
    await expect(
      database.query(`INSERT INTO resource_comment_threads
      (namespace_id, resource_id, type, quoted_text) VALUES ('namespace', 'resource', 'inline', '')`),
    ).rejects.toThrow('ck_resource_comment_threads_type_anchor');
  });

  it('rejects down for both live and soft-deleted document rows without modifying them', async () => {
    await database.query(
      `INSERT INTO resource_comment_threads
      (id, namespace_id, resource_id, type, quoted_text, anchor_from, anchor_to,
        anchor_prefix, anchor_suffix, content_hash, anchor_status)
      VALUES ($1, 'namespace', 'resource', 'document', '', NULL, NULL, NULL, NULL, NULL, NULL)`,
      [documentId],
    );
    for (const deleted of [false, true]) {
      if (deleted)
        await database.query(
          'UPDATE resource_comment_threads SET deleted_at = now() WHERE id = $1',
          [documentId],
        );
      const runner = database.createQueryRunner();
      try {
        await runner.startTransaction();
        await expect(
          new AddDocumentComments1792575770997().down(runner),
        ).rejects.toThrow('document thread rows remain');
      } finally {
        if (runner.isTransactionActive) await runner.rollbackTransaction();
        await runner.release();
      }
      expect(
        (
          await database.query(
            'SELECT type, anchor_from FROM resource_comment_threads WHERE id = $1',
            [documentId],
          )
        )[0],
      ).toEqual({ type: 'document', anchor_from: null });
    }
  });

  it('restores the old schema only when no document records exist', async () => {
    // This deletes only this test's isolated fixture to exercise the empty case.
    await database.query('DELETE FROM resource_comment_threads WHERE id = $1', [
      documentId,
    ]);
    const runner = database.createQueryRunner();
    try {
      await runner.startTransaction();
      await new AddDocumentComments1792575770997().down(runner);
      await runner.commitTransaction();
      const table = await runner.getTable('resource_comment_threads');
      expect(table?.findColumnByName('type')).toBeUndefined();
      expect(table?.findColumnByName('anchor_from')?.isNullable).toBe(false);
      expect(
        (
          await runner.query(
            'SELECT quoted_text FROM resource_comment_threads WHERE id = $1',
            [legacyId],
          )
        )[0],
      ).toEqual({ quoted_text: 'legacy quote' });
      await new AddDocumentComments1792575770997().up(runner);
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }
  });
});
