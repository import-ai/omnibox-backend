import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';
import { DataSource, EntityManager } from 'typeorm';

import {
  CreateResourceCommentThreadRequestDto,
  ListResourceCommentThreadsRequestDto,
} from './dto/resource-comment-request.dto';
import { ResourceCommentThreadResponseDto } from './dto/resource-comment-response.dto';
import { ResourceComment } from './entities/resource-comment.entity';
import { ResourceCommentAttachment } from './entities/resource-comment-attachment.entity';
import { ResourceCommentThread } from './entities/resource-comment-thread.entity';
import { ResourceCommentAnchorsService } from './resource-comment-anchors.service';
import { ResourceCommentAttachmentsService } from './resource-comment-attachments.service';
import { ResourceCommentQueriesService } from './resource-comment-queries.service';
import { ResourceCommentsService } from './resource-comments.service';

const i18n = { t: (key: string) => key } as any;
const documentRequest = () =>
  plainToInstance(CreateResourceCommentThreadRequestDto, {
    type: 'document',
    content: 'Document comment',
  });
const makeThread = (type = 'document') =>
  Object.assign(new ResourceCommentThread(), {
    id: 'thread',
    namespaceId: 'namespace',
    resourceId: 'resource',
    type,
    creatorId: 'author',
    quotedText: '',
    anchorFrom: null,
    anchorTo: null,
    anchorPrefix: null,
    anchorSuffix: null,
    contentHash: null,
    anchorStatus: null,
    resolvedAt: null,
    resolvedById: null,
    comments: [],
    createdAt: new Date('2026-10-20T00:00:00Z'),
    updatedAt: new Date('2026-10-20T00:00:00Z'),
  });

describe('document comment request contract', () => {
  it('accepts document comments without an anchor or content hash', async () => {
    expect(await validate(documentRequest())).toEqual([]);
  });

  it.each([
    { quoted_text: 'text' },
    { anchor_from: 0 },
    { anchor_to: 1 },
    { anchor_prefix: '' },
    { anchor_suffix: null },
    { expected_content_hash: 'a'.repeat(64) },
  ])('rejects anchor fields on document comments: %j', async (anchor) => {
    const dto = plainToInstance(CreateResourceCommentThreadRequestDto, {
      type: 'document',
      content: 'Comment',
      ...anchor,
    });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });

  it('keeps omitted type as inline and requires the existing anchor fields', async () => {
    const dto = plainToInstance(CreateResourceCommentThreadRequestDto, {
      content: 'Comment',
    });
    expect((await validate(dto)).map((error) => error.property)).toEqual(
      expect.arrayContaining([
        'quotedText',
        'anchorFrom',
        'anchorTo',
        'expectedContentHash',
      ]),
    );
  });

  it.each(['inline', 'sidebar', 'document'])(
    'accepts the %s list view',
    async (view) => {
      expect(
        await validate(
          plainToInstance(ListResourceCommentThreadsRequestDto, { view }),
        ),
      ).toEqual([]);
    },
  );

  it('rejects unknown list views', async () => {
    expect(
      (
        await validate(
          plainToInstance(ListResourceCommentThreadsRequestDto, {
            view: 'all',
          }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });

  it('serializes a document thread with explicit type and a null anchor', () => {
    expect(
      ResourceCommentThreadResponseDto.fromEntity(makeThread()),
    ).toMatchObject({
      type: 'document',
      quoted_text: '',
      anchor: null,
    });
  });
});

describe('document comment writes', () => {
  let service: ResourceCommentsService;
  let thread: ResourceCommentThread;
  let resource: Resource;
  let comment: ResourceComment;
  let manager: EntityManager;
  let save: jest.Mock;
  let softDelete: jest.Mock;
  let bindAttachments: jest.Mock;
  let checkPermission: jest.Mock;
  let anchors: ResourceCommentAnchorsService;

  beforeEach(() => {
    thread = makeThread();
    resource = Object.assign(new Resource(), {
      content: 'Unchanged document',
      resourceType: ResourceType.DOC,
    });
    comment = Object.assign(new ResourceComment(), {
      id: 'comment',
      threadId: 'thread',
      authorId: 'author',
      content: 'Original',
    });
    const threadRepository = {
      create: (data: object) =>
        Object.assign(new ResourceCommentThread(), data),
      findOne: jest.fn().mockResolvedValue(thread),
    };
    const commentRepository = {
      create: (data: object) => Object.assign(new ResourceComment(), data),
      findOne: jest.fn().mockResolvedValue(comment),
      count: jest.fn().mockResolvedValue(0),
    };
    save = jest.fn((entity) =>
      Promise.resolve(Object.assign(entity, { id: entity.id ?? 'new-id' })),
    );
    softDelete = jest.fn().mockResolvedValue({ affected: 1 });
    manager = {
      save,
      softDelete,
      getRepository: (entity) => {
        if (entity === ResourceCommentThread) return threadRepository;
        if (entity === ResourceComment) return commentRepository;
        if (entity === ResourceCommentAttachment)
          return { find: jest.fn().mockResolvedValue([]) };
        return { findOne: jest.fn().mockResolvedValue(resource) };
      },
    } as unknown as EntityManager;
    checkPermission = jest.fn().mockResolvedValue(undefined);
    bindAttachments = jest.fn().mockResolvedValue(undefined);
    anchors = new ResourceCommentAnchorsService(i18n);
    service = new ResourceCommentsService(
      {
        getThreadResponse: jest.fn(() =>
          Promise.resolve(ResourceCommentThreadResponseDto.fromEntity(thread)),
        ),
      } as unknown as ResourceCommentQueriesService,
      {
        transaction: (run: (manager: EntityManager) => Promise<unknown>) =>
          run(manager),
      } as DataSource,
      {
        userHasPermissionOrFail: checkPermission,
        userHasPermission: jest.fn().mockResolvedValue(true),
      } as unknown as PermissionsService,
      {
        bindAttachments,
        replaceAttachments: jest.fn(),
      } as unknown as ResourceCommentAttachmentsService,
      i18n,
      anchors,
      { find: jest.fn().mockResolvedValue([]) } as never,
      { find: jest.fn().mockResolvedValue([]) } as never,
    );
  });

  it('creates a document thread without comparing or changing resource content', async () => {
    const assertHash = jest.spyOn(anchors, 'assertContentHash');
    const assertRange = jest.spyOn(anchors, 'assertValidRange');
    const lock = jest.spyOn(anchors, 'lockResource');
    await service.createThread(
      'namespace',
      'resource',
      'author',
      documentRequest(),
    );
    expect(save.mock.calls[0][0]).toMatchObject({
      type: 'document',
      quotedText: '',
      anchorFrom: null,
      anchorTo: null,
      anchorPrefix: null,
      anchorSuffix: null,
      contentHash: null,
      anchorStatus: null,
    });
    expect(lock).toHaveBeenCalled();
    expect(assertHash).not.toHaveBeenCalled();
    expect(assertRange).not.toHaveBeenCalled();
    expect(resource.content).toBe('Unchanged document');
    expect(checkPermission).toHaveBeenCalledWith(
      'namespace',
      'resource',
      'author',
      ResourcePermission.CAN_COMMENT,
    );
    expect(bindAttachments).toHaveBeenCalled();
  });

  it.each([
    ResourceType.FOLDER,
    ResourceType.SMART_FOLDER,
    ResourceType.RSS_FOLDER,
  ])('rejects document comments on %s containers', async (resourceType) => {
    resource.resourceType = resourceType;
    await expect(
      service.createThread(
        'namespace',
        'resource',
        'author',
        documentRequest(),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(save).not.toHaveBeenCalled();
  });

  it('rejects an empty document comment using the existing content rule', async () => {
    await expect(
      service.createThread('namespace', 'resource', 'author', {
        ...documentRequest(),
        content: ' ',
      }),
    ).rejects.toMatchObject({ code: 'EMPTY_COMMENT' });
  });

  it('binds images for an image-only document comment', async () => {
    await service.createThread('namespace', 'resource', 'author', {
      ...documentRequest(),
      content: '',
      attachmentIds: ['image'],
    });
    expect(bindAttachments).toHaveBeenCalledWith(
      manager,
      'namespace',
      'resource',
      'author',
      'new-id',
      ['image'],
    );
  });

  it('rejects document replies before persisting a comment', async () => {
    await expect(
      service.createComment('namespace', 'resource', 'thread', 'author', {
        content: 'Reply',
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(save).not.toHaveBeenCalled();
  });

  it.each(['thread', 'comment'])(
    'allows editor soft deletion of another author’s document %s',
    async (target) => {
      const deletion =
        target === 'thread'
          ? service.deleteThread('namespace', 'resource', 'thread', 'editor')
          : service.deleteComment(
              'namespace',
              'resource',
              'thread',
              'comment',
              'editor',
            );
      await deletion;
      expect(softDelete).toHaveBeenCalledWith(
        ResourceComment,
        target === 'thread'
          ? { threadId: 'thread' }
          : { id: 'comment', threadId: 'thread' },
      );
      expect(softDelete).toHaveBeenCalledWith(ResourceCommentThread, {
        id: 'thread',
      });
    },
  );

  it.each(['thread', 'comment'])(
    'preserves editor moderation for inline %s deletion',
    async (target) => {
      Object.assign(thread, { type: 'inline' });
      if (target === 'thread')
        await service.deleteThread('namespace', 'resource', 'thread', 'editor');
      else
        await service.deleteComment(
          'namespace',
          'resource',
          'thread',
          'comment',
          'editor',
        );
      expect(softDelete).toHaveBeenCalled();
    },
  );

  it('soft-deletes the document thread and its comments for the author', async () => {
    await service.deleteThread('namespace', 'resource', 'thread', 'author');
    expect(softDelete.mock.calls).toEqual([
      [ResourceComment, { threadId: 'thread' }],
      [ResourceCommentThread, { id: 'thread' }],
    ]);
  });

  it('allows an editor to resolve and reopen without changing original creation time', async () => {
    const createdAt = thread.createdAt;
    await service.updateThread('namespace', 'resource', 'thread', 'editor', {
      resolved: true,
    });
    expect(thread.resolvedAt).toBeInstanceOf(Date);
    await service.updateThread('namespace', 'resource', 'thread', 'editor', {
      resolved: false,
    });
    expect(thread.resolvedAt).toBeNull();
    expect(thread.createdAt).toBe(createdAt);
  });
});
