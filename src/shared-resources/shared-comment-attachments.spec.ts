import { Readable } from 'node:stream';

import { ForbiddenException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as cookieParser from 'cookie-parser';
import { I18nService } from 'nestjs-i18n';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import type { ResourceCommentThreadResponseDto } from 'omniboxd/resource-comments/dto/resource-comment-response.dto';
import { ResourceCommentAttachment } from 'omniboxd/resource-comments/entities/resource-comment-attachment.entity';
import {
  ResourceCommentAnchorStatus,
  ResourceCommentThread,
} from 'omniboxd/resource-comments/entities/resource-comment-thread.entity';
import { ResourceCommentsService } from 'omniboxd/resource-comments/resource-comments.service';
import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { S3Service } from 'omniboxd/s3/s3.service';
import { Share, ShareType } from 'omniboxd/shares/entities/share.entity';
import { SharesService } from 'omniboxd/shares/shares.service';
import { SmartFoldersService } from 'omniboxd/smart-folders/smart-folders.service';
import { TagService } from 'omniboxd/tag/tag.service';
import * as request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { SharedResourcesController } from './shared-resources.controller';
import { SharedResourcesService } from './shared-resources.service';

const attachment = Object.assign(new ResourceCommentAttachment(), {
  id: 'image-id',
  namespaceId: 'namespace',
  resourceId: 'resource',
  commentId: 'comment',
  objectKey: 'comment-image',
  name: 'image.png',
  mimetype: 'image/png',
  size: 5,
});
const workspaceImageUrl =
  '/api/v1/namespaces/namespace/resources/resource/comment-attachments/image-id';
const sharedResourceUrl = '/api/v1/shares/share/resources/resource';
const sharedImageUrl = `${sharedResourceUrl}/comment-attachments/image-id`;
const thread: ResourceCommentThreadResponseDto = {
  id: 'thread',
  quoted_text: 'text',
  resolved: false,
  anchor: {
    from: 1,
    to: 5,
    prefix: '',
    suffix: '',
    content_hash: 'hash',
    status: ResourceCommentAnchorStatus.ACTIVE,
  },
  creator: { id: 'author', username: 'Author' },
  comments: [
    {
      id: 'comment',
      content: '',
      author: { id: 'author', username: 'Author' },
      attachments: [
        {
          id: attachment.id,
          url: workspaceImageUrl,
          name: attachment.name,
          mimetype: attachment.mimetype,
          size: attachment.size,
        },
      ],
      created_at: '2026-09-10T00:00:00Z',
      updated_at: '2026-09-10T00:00:00Z',
    },
  ],
  created_at: '2026-09-10T00:00:00Z',
  updated_at: '2026-09-10T00:00:00Z',
};

describe('shared comment images', () => {
  let app: INestApplication<App>;
  let share: Share;
  const findAttachment = jest.fn();
  const getObject = jest.fn();
  const validateShare = jest.fn();
  const checkPermission = jest.fn();

  beforeAll(async () => {
    const resource = Object.assign(new Resource(), {
      id: 'resource',
      namespaceId: 'namespace',
      name: 'Document',
      content: 'text',
      resourceType: ResourceType.DOC,
      attrs: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const module = await Test.createTestingModule({
      controllers: [SharedResourcesController],
      providers: [
        SharedResourcesService,
        ResourceCommentsService,
        { provide: getRepositoryToken(ResourceCommentThread), useValue: {} },
        {
          provide: getRepositoryToken(ResourceCommentAttachment),
          useValue: { findOne: findAttachment },
        },
        { provide: DataSource, useValue: {} },
        {
          provide: PermissionsService,
          useValue: { userHasPermissionOrFail: checkPermission },
        },
        { provide: S3Service, useValue: { getObject } },
        {
          provide: ResourcesService,
          useValue: {
            getResource: (namespaceId: string, resourceId: string) =>
              Promise.resolve(
                namespaceId === resource.namespaceId &&
                  resourceId === resource.id
                  ? resource
                  : null,
              ),
          },
        },
        { provide: SmartFoldersService, useValue: {} },
        { provide: TagService, useValue: {} },
        {
          provide: SharesService,
          useValue: { getAndValidateShare: validateShare },
        },
        { provide: I18nService, useValue: { t: (key: string) => key } },
      ],
    }).compile();
    const commentsService = module.get(ResourceCommentsService);
    jest
      .spyOn(commentsService, 'getResourceCommentData')
      .mockResolvedValue({ content_hash: 'hash', comment_threads: [thread] });
    jest.spyOn(commentsService, 'listThreads').mockResolvedValue({
      items: [thread],
      total: 1,
      offlet: 0,
      limits: 20,
      has_more: false,
    });
    app = module.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    share = Object.assign(new Share(), {
      id: 'share',
      namespaceId: 'namespace',
      resourceId: 'resource',
      shareType: ShareType.DOC_ONLY,
      allResources: false,
    });
    validateShare.mockImplementation(() => Promise.resolve(share));
    findAttachment.mockResolvedValue(attachment);
    getObject.mockImplementation(() =>
      Promise.resolve({
        stream: Readable.from(Buffer.from('image')),
        meta: { contentType: 'image/png', contentLength: 5 },
      }),
    );
  });

  afterAll(async () => {
    await app.close();
    jest.restoreAllMocks();
  });

  it('returns share image URLs in both the resource and paged comments', async () => {
    const detail = await request(app.getHttpServer())
      .get(sharedResourceUrl)
      .expect(200);
    const list = await request(app.getHttpServer())
      .get(`${sharedResourceUrl}/comment-threads`)
      .expect(200);
    expect(detail.body.comment_threads[0].comments[0].attachments[0].url).toBe(
      sharedImageUrl,
    );
    expect(list.body.items[0].comments[0].attachments[0].url).toBe(
      sharedImageUrl,
    );
    expect(thread.comments[0].attachments[0].url).toBe(workspaceImageUrl);
  });

  it('streams images anonymously through the validated share without workspace permissions', async () => {
    const response = await request(app.getHttpServer())
      .get(sharedImageUrl)
      .expect(200)
      .expect('Content-Type', /image\/png/)
      .expect('Cache-Control', 'private, no-store');
    expect(response.body).toEqual(Buffer.from('image'));
    expect(validateShare).toHaveBeenCalledWith('share', undefined, undefined);
    expect(checkPermission).not.toHaveBeenCalled();
    expect(findAttachment).toHaveBeenCalledWith({
      where: {
        id: 'image-id',
        namespaceId: 'namespace',
        resourceId: 'resource',
        comment: {
          thread: { namespaceId: 'namespace', resourceId: 'resource' },
        },
      },
    });
  });

  it('passes the share password cookie to share validation', async () => {
    await request(app.getHttpServer())
      .get(sharedImageUrl)
      .set('Cookie', 'share-password=test-password')
      .expect(200);
    expect(validateShare).toHaveBeenCalledWith(
      'share',
      'test-password',
      undefined,
    );
  });

  it('rejects downloads when share validation fails', async () => {
    validateShare.mockRejectedValueOnce(new ForbiddenException());
    await request(app.getHttpServer()).get(sharedImageUrl).expect(403);
    expect(findAttachment).not.toHaveBeenCalled();
    expect(getObject).not.toHaveBeenCalled();
  });

  it('rejects images on chat-only shares', async () => {
    share.shareType = ShareType.CHAT_ONLY;
    await request(app.getHttpServer()).get(sharedImageUrl).expect(403);
    expect(findAttachment).not.toHaveBeenCalled();
  });

  it('rejects resources outside the share before reading the attachment', async () => {
    await request(app.getHttpServer())
      .get(
        sharedImageUrl.replace('/resources/resource/', '/resources/outside/'),
      )
      .expect(404);
    expect(findAttachment).not.toHaveBeenCalled();
  });

  it('returns 404 when no published attachment matches the resource', async () => {
    findAttachment.mockResolvedValueOnce(null);
    await request(app.getHttpServer()).get(sharedImageUrl).expect(404);
    expect(getObject).not.toHaveBeenCalled();
  });
});
