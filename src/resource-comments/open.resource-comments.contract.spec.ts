import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import {
  APIKeyPermissionTarget,
  APIKeyPermissionType,
} from 'omniboxd/api-key/api-key.entity';
import { APIKeyService } from 'omniboxd/api-key/api-key.service';
import { APIKeyAuthGuard } from 'omniboxd/auth/api-key/api-key-auth.guard';
import { JwtAuthGuard } from 'omniboxd/auth/jwt-auth.guard';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { OpenResourcesService } from 'omniboxd/namespace-resources/open-resources.service';
import { OpenAPIQuotaGuard } from 'omniboxd/open-api/open-api-quota.guard';
import { OpenAPIQuotaService } from 'omniboxd/open-api/open-api-quota.service';
import { User } from 'omniboxd/user/entities/user.entity';
import * as request from 'supertest';

import { OpenResourceCommentsController } from './open.resource-comments.controller';
import { ResourceCommentOpenQueriesService } from './resource-comment-open-queries.service';

describe('Open comments public schema and HTTP contract', () => {
  let app: INestApplication;
  const listThreads = jest.fn().mockResolvedValue({
    items: [],
    total: 0,
    offset: 0,
    limit: 20,
    has_more: false,
  });
  const listComments = jest.fn().mockResolvedValue({
    items: [],
    total: 0,
    offset: 0,
    limit: 20,
    has_more: false,
    mention_display_names: {},
  });

  const key = {
    namespaceId: 'space',
    userId: 'user',
    attrs: {
      root_resource_id: 'root',
      permissions: [
        {
          target: APIKeyPermissionTarget.RESOURCES,
          permissions: [APIKeyPermissionType.READ],
        },
      ],
    },
  };
  const findByValue = jest.fn((value: string) =>
    Promise.resolve(value === 'sk-contract' ? key : null),
  );
  const assertAndConsume = jest
    .fn<Promise<void>, [string]>()
    .mockResolvedValue(undefined);
  const get = (path: string) =>
    request(app.getHttpServer())
      .get(path)
      .set('Authorization', 'Bearer sk-contract');

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [OpenResourceCommentsController],
      providers: [
        { provide: APIKeyService, useValue: { findByValue } },
        { provide: I18nService, useValue: { t: (value: string) => value } },
        {
          provide: getRepositoryToken(User),
          useValue: { findOne: () => Promise.resolve({ id: 'user' }) },
        },
        { provide: OpenAPIQuotaService, useValue: { assertAndConsume } },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: APIKeyAuthGuard },
        { provide: APP_GUARD, useClass: OpenAPIQuotaGuard },
        {
          provide: OpenResourcesService,
          useValue: {
            resolveResourceId: (
              _namespace: string,
              _scope: string,
              id: string,
            ) => Promise.resolve(id),
          },
        },
        {
          provide: ResourceCommentOpenQueriesService,
          useValue: { listThreads, listComments },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
  });
  afterAll(() => app?.close());
  beforeEach(() => {
    jest.clearAllMocks();
    assertAndConsume.mockResolvedValue(undefined);
  });

  it('publishes typed nested responses and two GET-only operations', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .addApiKey(
          { type: 'apiKey', name: 'Authorization', in: 'header' },
          'api-key',
        )
        .build(),
    );
    const operationQuery =
      document.paths['/open/api/v1/resources/{resourceId}/comment-threads'].get!
        .parameters;
    expect(operationQuery).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'offset',
          schema: expect.objectContaining({ type: 'number' }),
        }),
        expect.objectContaining({
          name: 'limit',
          schema: expect.objectContaining({ type: 'number' }),
        }),
      ]),
    );
    const root = '/open/api/v1/resources/{resourceId}/comment-threads';
    for (const path of [root, `${root}/{threadId}/comments`]) {
      expect(Object.keys(document.paths[path])).toEqual(['get']);
      expect(document.paths[path].get!.security).toEqual([{ 'api-key': [] }]);
    }
    const schemas = document.components!.schemas!;
    expect(schemas.OpenListCommentThreadsResponseDto).toHaveProperty(
      'properties.total',
    );
    expect(schemas.OpenResourceCommentThreadResponseDto).toHaveProperty(
      'properties.anchor.nullable',
      true,
    );
    expect(schemas.OpenResourceCommentThreadResponseDto).toHaveProperty(
      'properties.comments_pagination',
    );
    expect(schemas.OpenCommentPreviewPaginationResponseDto).toHaveProperty(
      'properties.limit.default',
      1,
    );
    expect(schemas.OpenListCommentsResponseDto).toHaveProperty(
      'properties.mention_display_names',
    );
    expect(
      Object.keys(
        (schemas.OpenCommentAttachmentResponseDto as { properties: object })
          .properties,
      ).sort(),
    ).toEqual(['id', 'mimetype', 'name', 'size']);
  });

  it('transforms pagination and uses only server-side identity', async () => {
    await get(
      '/open/api/v1/resources/doc/comment-threads?limit=100&offset=5&type=inline&resolved=true',
    )
      .set('X-User-Id', 'attacker')
      .expect(200);
    expect(listThreads).toHaveBeenCalledWith(
      'space',
      'doc',
      'user',
      expect.objectContaining({
        limit: 100,
        offset: 5,
        type: 'inline',
        resolved: 'true',
      }),
    );
  });

  it.each([
    'offset=',
    'offset=1e2',
    'offset=1&offset=2',
    'limit=101',
    'resolved=no',
    'type=sidebar',
  ])('rejects query before invoking the service: %s', async (query) => {
    await get(`/open/api/v1/resources/doc/comment-threads?${query}`).expect(
      400,
    );
    expect(listThreads).not.toHaveBeenCalled();
  });

  it('rejects a missing API key before invoking business services', async () => {
    await request(app.getHttpServer())
      .get('/open/api/v1/resources/doc/comment-threads')
      .expect(401);
    expect(listThreads).not.toHaveBeenCalled();
  });

  it('rejects an invalid UUID before querying comments', async () => {
    await get(
      '/open/api/v1/resources/doc/comment-threads/invalid/comments',
    ).expect(400);
    expect(listComments).not.toHaveBeenCalled();
  });
  it('enforces real API key and quota guards before the query service', async () => {
    const path = '/open/api/v1/resources/doc/comment-threads';
    await request(app.getHttpServer()).get(path).expect(401);
    await get(path).set('Authorization', 'Bearer sk-invalid').expect(401);
    const permissions = key.attrs.permissions;
    key.attrs.permissions = [];
    try {
      await get(path).expect(403);
    } finally {
      key.attrs.permissions = permissions;
    }
    assertAndConsume.mockRejectedValueOnce(
      new AppException(
        'Quota exceeded',
        'OPEN_API_REQUESTS_PER_24H_EXCEEDED',
        429,
      ),
    );
    const response = await get(path).expect(429);
    expect(response.body.code).toBe('open_api_requests_per_24h_exceeded');
    expect(listThreads).not.toHaveBeenCalled();
    expect(assertAndConsume).toHaveBeenCalledWith('space');
  });
});
