import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import {
  comparePermission,
  ResourcePermission,
} from 'omniboxd/permissions/resource-permission.enum';
import { Resource } from 'omniboxd/resources/entities/resource.entity';
import { S3Service } from 'omniboxd/s3/s3.service';
import { Readable } from 'stream';
import { DataSource, EntityManager, SelectQueryBuilder } from 'typeorm';

import { ResourceComment } from './entities/resource-comment.entity';
import { ResourceCommentAttachment } from './entities/resource-comment-attachment.entity';
import { ResourceCommentThread } from './entities/resource-comment-thread.entity';
import { ResourceCommentsService } from './resource-comments.service';

describe('Resource comment write permissions', () => {
  let service: ResourceCommentsService;
  let permission: ResourcePermission;
  let thread: ResourceCommentThread;
  let comment: ResourceComment;
  let save: jest.SpyInstance;
  let softDelete: jest.SpyInstance;
  const manager = new EntityManager(new DataSource({ type: 'postgres' }));
  const transaction = jest.fn(
    (run: (manager: EntityManager) => Promise<unknown>) => run(manager),
  );
  const putObject = jest.fn();
  const checkPermission = jest.fn(
    (
      _namespaceId: string,
      _resourceId: string,
      _userId: string,
      required: ResourcePermission,
    ) => {
      if (comparePermission(permission, required) < 0) {
        return Promise.reject(new ForbiddenException());
      }
      return Promise.resolve();
    },
  );
  const operations = [
    {
      name: 'edit',
      run: () =>
        service.updateComment(
          'namespace',
          'resource',
          'thread',
          'comment',
          'author',
          { content: 'Edited' },
        ),
    },
    {
      name: 'resolve',
      run: () =>
        service.updateThread('namespace', 'resource', 'thread', 'author', {
          resolved: true,
        }),
    },
    {
      name: 'reopen',
      run: () =>
        service.updateThread('namespace', 'resource', 'thread', 'author', {
          resolved: false,
        }),
    },
    {
      name: 'delete thread',
      run: () =>
        service.deleteThread('namespace', 'resource', 'thread', 'author'),
    },
    {
      name: 'delete comment',
      run: () =>
        service.deleteComment(
          'namespace',
          'resource',
          'thread',
          'comment',
          'author',
        ),
    },
  ];
  const createOperations = [
    {
      name: 'create thread',
      run: () =>
        service.createThread('namespace', 'resource', 'author', {
          quotedText: 'Text',
          anchorFrom: 1,
          anchorTo: 5,
          expectedContentHash: 'hash',
          content: 'New comment',
        }),
    },
    {
      name: 'reply',
      run: () =>
        service.createComment('namespace', 'resource', 'thread', 'author', {
          content: 'Reply',
        }),
    },
    {
      name: 'upload image',
      run: () =>
        service.uploadAttachment('namespace', 'resource', 'author', {
          fieldname: 'file',
          originalname: 'image.png',
          encoding: '7bit',
          mimetype: 'image/png',
          size: 0,
          buffer: Buffer.alloc(0),
          stream: Readable.from([]),
          destination: '',
          filename: '',
          path: '',
        }),
    },
  ];

  beforeEach(async () => {
    permission = ResourcePermission.CAN_COMMENT;
    thread = Object.assign(new ResourceCommentThread(), {
      id: 'thread',
      namespaceId: 'namespace',
      resourceId: 'resource',
      creatorId: 'author',
      resolvedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    comment = Object.assign(new ResourceComment(), {
      id: 'comment',
      threadId: thread.id,
      authorId: 'author',
      content: 'Original',
    });
    const threadRepository = manager.getRepository(ResourceCommentThread);
    jest.spyOn(threadRepository, 'findOne').mockResolvedValue(thread);
    const builder = new SelectQueryBuilder<ResourceCommentThread>(
      manager.connection,
    );
    jest.spyOn(threadRepository, 'createQueryBuilder').mockReturnValue(builder);
    jest.spyOn(builder, 'leftJoinAndSelect').mockReturnThis();
    jest.spyOn(builder, 'getOne').mockResolvedValue(thread);
    jest
      .spyOn(manager.getRepository(Resource), 'findOne')
      .mockResolvedValue(new Resource());
    jest
      .spyOn(manager.getRepository(ResourceComment), 'findOne')
      .mockResolvedValue(comment);
    jest
      .spyOn(manager.getRepository(ResourceComment), 'count')
      .mockResolvedValue(0);
    jest
      .spyOn(manager.getRepository(ResourceCommentAttachment), 'find')
      .mockResolvedValue([]);
    save = jest.spyOn(manager, 'save').mockResolvedValue(thread);
    softDelete = jest
      .spyOn(manager, 'softDelete')
      .mockResolvedValue({ raw: [], affected: 1, generatedMaps: [] });
    const module = await Test.createTestingModule({
      providers: [
        ResourceCommentsService,
        {
          provide: getRepositoryToken(ResourceCommentThread),
          useValue: threadRepository,
        },
        {
          provide: getRepositoryToken(ResourceCommentAttachment),
          useValue: {},
        },
        { provide: DataSource, useValue: { transaction } },
        {
          provide: PermissionsService,
          useValue: {
            userHasPermissionOrFail: checkPermission,
            userHasPermission: () =>
              Promise.resolve(
                comparePermission(permission, ResourcePermission.CAN_EDIT) >= 0,
              ),
          },
        },
        { provide: S3Service, useValue: { putObject } },
        { provide: I18nService, useValue: { t: (key: string) => key } },
      ],
    }).compile();
    service = module.get(ResourceCommentsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  describe.each([ResourcePermission.NO_ACCESS, ResourcePermission.CAN_VIEW])(
    '%s',
    (deniedPermission) => {
      it.each([...operations, ...createOperations])(
        'rejects $name before any write, including for the author',
        async ({ run }) => {
          permission = deniedPermission;
          await expect(run()).rejects.toMatchObject({ status: 403 });
          expect(transaction).not.toHaveBeenCalled();
          expect(putObject).not.toHaveBeenCalled();
        },
      );
    },
  );

  it.each(operations)(
    'allows an author with comment permission to $name',
    async ({ run }) => {
      await run();
      expect(transaction).toHaveBeenCalledTimes(1);
      expect(checkPermission).toHaveBeenCalledWith(
        'namespace',
        'resource',
        'author',
        ResourcePermission.CAN_COMMENT,
      );
    },
  );

  it.each(operations)(
    'does not allow a commenter to $name another author’s comment',
    async ({ run }) => {
      thread.creatorId = 'other';
      comment.authorId = 'other';
      await expect(run()).rejects.toMatchObject({ status: 403 });
      expect(save).not.toHaveBeenCalled();
      expect(softDelete).not.toHaveBeenCalled();
    },
  );

  it('persists edits and resolution after the author regains comment permission', async () => {
    permission = ResourcePermission.CAN_VIEW;
    await expect(operations[0].run()).rejects.toMatchObject({ status: 403 });
    permission = ResourcePermission.CAN_COMMENT;
    await operations[0].run();
    expect(comment.content).toBe('Edited');
    expect(save).toHaveBeenCalledWith(comment);
    await operations[1].run();
    expect(thread.resolvedAt).toBeInstanceOf(Date);
    expect(thread.resolvedById).toBe('author');
  });
});
