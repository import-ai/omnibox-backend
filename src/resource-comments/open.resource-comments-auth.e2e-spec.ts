import { createHash } from 'node:crypto';

import { HttpStatus } from '@nestjs/common';
import {
  APIKeyPermissionTarget,
  APIKeyPermissionType,
} from 'omniboxd/api-key/api-key.entity';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { NamespaceMember } from 'omniboxd/namespaces/entities/namespace-member.entity';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';
import { OpenAPIQuotaService } from 'omniboxd/open-api/open-api-quota.service';
import { UserPermission } from 'omniboxd/permissions/entities/user-permission.entity';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';
import { User } from 'omniboxd/user/entities/user.entity';
import { TestClient } from 'test/test-client';
import { DataSource } from 'typeorm';

import { ResourceComment } from './entities/resource-comment.entity';
import { ResourceCommentThread } from './entities/resource-comment-thread.entity';

describe('Open resource comment authorization (e2e)', () => {
  let owner: TestClient;
  let other: TestClient;
  let db: DataSource;
  let resourceId: string;
  let resourceSequence = 0;
  const content = 'Original document';
  const hash = createHash('sha256').update(content).digest('hex');
  const webPath = () =>
    `/api/v1/namespaces/${owner.namespace.id}/resources/${resourceId}/comment-threads`;
  const openPath = () => `/open/api/v1/resources/${resourceId}/comment-threads`;
  const read = (path = openPath(), key = owner.apiKey.value) =>
    owner.request().get(path).set('Authorization', `Bearer ${key}`);

  const createResource = async (
    client = owner,
    parentId = client.namespace.root_resource_id,
  ) =>
    (
      await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .send({
          name: `Open comments fixture ${++resourceSequence}`,
          namespaceId: client.namespace.id,
          parentId,
          resourceType: ResourceType.DOC,
          content,
        })
        .expect(201)
    ).body.id as string;

  const createThread = async (type: 'document' | 'inline' = 'document') =>
    (
      await owner
        .post(webPath())
        .send(
          type === 'document'
            ? { type, content: 'Document comment' }
            : {
                type,
                content: 'Inline comment',
                quoted_text: 'Original',
                anchor_from: 0,
                anchor_to: 8,
                expected_content_hash: hash,
              },
        )
        .expect(201)
    ).body.thread as { id: string; comments: { id: string }[] };

  const createKey = async (
    rootId = owner.namespace.root_resource_id,
    permissions = [APIKeyPermissionType.READ],
  ) =>
    (
      await owner
        .post('/api/v1/api-keys')
        .send({
          namespace_id: owner.namespace.id,
          user_id: owner.user.id,
          attrs: {
            root_resource_id: rootId,
            permissions: [
              { target: APIKeyPermissionTarget.RESOURCES, permissions },
            ],
          },
        })
        .expect(201)
    ).body as { id: string; value: string };

  beforeAll(async () => {
    owner = await TestClient.create();
    other = await TestClient.create();
    db = owner.app.get(DataSource);
    const invitation = (
      await owner
        .post(`/api/v1/namespaces/${owner.namespace.id}/invitations`)
        .send({
          namespaceRole: 'member',
          rootPermission: ResourcePermission.CAN_EDIT,
        })
        .expect(201)
    ).body;
    await other
      .post(
        `/api/v1/namespaces/${owner.namespace.id}/invitations/${invitation.id}/accept`,
      )
      .expect(201);
  });

  beforeEach(async () => {
    resourceId = await createResource();
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    await other?.close();
    await owner?.close();
  });

  it('rejects missing, invalid and deleted keys and keys without read permission', async () => {
    await owner.request().get(openPath()).expect(401);
    await read(openPath(), 'sk-invalid').expect(401);
    const noRead = await createKey(undefined, [APIKeyPermissionType.CREATE]);
    await read(openPath(), noRead.value).expect(403);
    const removed = await createKey();
    await owner.delete(`/api/v1/api-keys/${removed.id}`).expect(200);
    await read(openPath(), removed.value).expect(401);
  });

  it('enforces resource scope on both endpoints and ignores a forged user header', async () => {
    const allowedId = await createResource();
    const scoped = await createKey(allowedId);
    const thread = await createThread();
    for (const path of [openPath(), `${openPath()}/${thread.id}/comments`]) {
      await read(path, scoped.value).expect(403);
      await read(path, other.apiKey.value)
        .set('X-User-Id', owner.user.id)
        .expect(404);
      await read(path).set('X-User-Id', other.user.id).expect(200);
    }
  });

  it('rejects a retained key after its owner loses namespace membership', async () => {
    const member = await db.getRepository(NamespaceMember).findOneByOrFail({
      namespaceId: owner.namespace.id,
      userId: owner.user.id,
    });
    const thread = await createThread();
    await db.getRepository(NamespaceMember).softDelete(member.id);
    try {
      await read().expect(403);
      await read(`${openPath()}/${thread.id}/comments`).expect(403);
    } finally {
      await db.getRepository(NamespaceMember).restore(member.id);
    }
  });

  it('supports a real combined key and rechecks permissions without removing membership', async () => {
    const key = (
      await other
        .post('/api/v1/api-keys')
        .send({
          namespace_id: owner.namespace.id,
          user_id: other.user.id,
          attrs: {
            resource_scope: 'personal_and_team',
            permissions: [
              {
                target: APIKeyPermissionTarget.RESOURCES,
                permissions: [APIKeyPermissionType.READ],
              },
            ],
          },
        })
        .expect(201)
    ).body;
    const thread = await createThread();
    const path = `${openPath()}/${thread.id}/comments`;
    await read(openPath(), key.value).expect(200);
    await read(path, key.value).expect(200);
    const namespaces = owner.app.get(NamespacesService);
    const privateId = await namespaces.getPrivateRootId(
      other.user.id,
      owner.namespace.id,
    );
    await read(
      `/open/api/v1/resources/${privateId}/comment-threads`,
      key.value,
    ).expect(200);
    const ownerPrivateId = await namespaces.getPrivateRootId(
      owner.user.id,
      owner.namespace.id,
    );
    await read(
      `/open/api/v1/resources/${ownerPrivateId}/comment-threads`,
      key.value,
    ).expect(403);
    await db.getRepository(UserPermission).save({
      namespaceId: owner.namespace.id,
      userId: other.user.id,
      resourceId,
      permission: ResourcePermission.NO_ACCESS,
    });
    try {
      await read(openPath(), key.value).expect(403);
      await read(path, key.value).expect(403);
    } finally {
      await db.getRepository(UserPermission).delete({
        namespaceId: owner.namespace.id,
        userId: other.user.id,
        resourceId,
      });
    }
    const membership = await db.getRepository(NamespaceMember).findOneByOrFail({
      namespaceId: owner.namespace.id,
      userId: other.user.id,
    });
    await db.getRepository(NamespaceMember).softDelete(membership.id);
    try {
      await read(openPath(), key.value).expect(403);
      await read(path, key.value).expect(403);
    } finally {
      await db.getRepository(NamespaceMember).restore(membership.id);
    }
  });

  it('rejects a document moved outside the key root', async () => {
    const folder = (
      await owner
        .post(`/api/v1/namespaces/${owner.namespace.id}/resources`)
        .send({
          name: 'Scoped folder',
          resourceType: ResourceType.FOLDER,
          namespaceId: owner.namespace.id,
          parentId: owner.namespace.root_resource_id,
        })
        .expect(201)
    ).body;
    resourceId = await createResource(owner, folder.id);
    const thread = await createThread();
    const key = await createKey(folder.id);
    await read(openPath(), key.value).expect(200);
    await db
      .getRepository(Resource)
      .update(resourceId, { parentId: owner.namespace.root_resource_id });
    await read(openPath(), key.value).expect(403);
    await read(`${openPath()}/${thread.id}/comments`, key.value).expect(403);
  });

  it('keeps a deleted author identity and member display snapshot', async () => {
    const thread = await createThread();
    const membership = await db.getRepository(NamespaceMember).findOneByOrFail({
      namespaceId: owner.namespace.id,
      userId: other.user.id,
    });
    await db
      .getRepository(NamespaceMember)
      .update(membership.id, { displayNameSnapshot: 'Historical author' });
    await db
      .getRepository(ResourceCommentThread)
      .update(thread.id, { creatorId: other.user.id });
    await db
      .getRepository(ResourceComment)
      .update(thread.comments[0].id, { authorId: other.user.id });
    await db.getRepository(User).softDelete(other.user.id);
    try {
      const result = (await read().expect(200)).body.items[0];
      const identity = { id: other.user.id, display_name: 'Historical author' };
      expect(result.creator).toEqual(identity);
      expect(result.comments[0].author).toEqual(identity);
    } finally {
      await db.getRepository(User).restore(other.user.id);
    }
  });

  it('retains quota enforcement on both endpoints', async () => {
    const thread = await createThread();
    const quota = jest
      .spyOn(owner.app.get(OpenAPIQuotaService), 'assertAndConsume')
      .mockRejectedValue(
        new AppException(
          'Open API requests per 24 hours exceeded',
          'OPEN_API_REQUESTS_PER_24H_EXCEEDED',
          HttpStatus.TOO_MANY_REQUESTS,
        ),
      );
    for (const path of [openPath(), `${openPath()}/${thread.id}/comments`]) {
      const response = await read(path).expect(429);
      expect(response.body.code).toBe('open_api_requests_per_24h_exceeded');
    }
    expect(quota).toHaveBeenCalledWith(owner.namespace.id);
  });

  it('does not expose comment mutation through API-key authentication', async () => {
    const thread = await createThread();
    for (const method of ['post', 'patch', 'delete'] as const) {
      await owner
        .request()
        [method](`${openPath()}/${thread.id}/comments`)
        .set('Authorization', `Bearer ${owner.apiKey.value}`)
        .expect(404);
      const target =
        method === 'post'
          ? webPath()
          : `${webPath()}/${thread.id}/comments/${thread.comments[0].id}`;
      await owner
        .request()
        [method](target)
        .set('Authorization', `Bearer ${owner.apiKey.value}`)
        .expect(401);
    }
  });

  it('publishes both operations and their nested response schemas in public Swagger', async () => {
    const swagger = (
      await owner.request().get('/open/api/docs-json').expect(200)
    ).body;
    const root = '/v1/resources/{resourceId}/comment-threads';
    for (const path of [root, `${root}/{threadId}/comments`]) {
      expect(Object.keys(swagger.paths[path])).toEqual(['get']);
      expect(swagger.paths[path].get.security).toEqual([{ 'api-key': [] }]);
      expect(
        swagger.paths[path].get.responses['200'].content['application/json']
          .schema.$ref,
      ).toBeDefined();
    }
    const schemas = swagger.components.schemas;
    const responseRef =
      swagger.paths[root].get.responses['200'].content['application/json']
        .schema.$ref;
    const listSchema = schemas[responseRef.split('/').pop()];
    const threadSchema =
      schemas[listSchema.properties.items.items.$ref.split('/').pop()];
    expect(threadSchema.properties.comments_pagination).toBeDefined();
    expect(threadSchema.properties.anchor.nullable).toBe(true);
    const commentSchema =
      schemas[threadSchema.properties.comments.items.$ref.split('/').pop()];
    const attachmentSchema =
      schemas[commentSchema.properties.attachments.items.$ref.split('/').pop()];
    expect(Object.keys(attachmentSchema.properties).sort()).toEqual([
      'id',
      'mimetype',
      'name',
      'size',
    ]);
  });
});
