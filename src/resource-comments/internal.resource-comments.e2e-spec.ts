import { createHash } from 'node:crypto';

import { HttpStatus } from '@nestjs/common';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import { commentPng } from 'test/comment-image-fixture';
import { TestClient } from 'test/test-client';

// The internal comment-thread routes serve the assistant: the workspace route
// checks the x-user-id header's view permission, the share route trusts the
// share the way the other internal share routes do.
describe('Internal resource comments (e2e)', () => {
  let owner: TestClient;
  let commenter: TestClient;
  let outsider: TestClient;
  let resourceId: string;
  let shareId: string;
  let attachmentId: string;
  let openThreadId: string;
  let resolvedThreadId: string;

  const internalThreadsUrl = () =>
    `/internal/api/v1/namespaces/${owner.namespace.id}/resources/${resourceId}/comment-threads`;
  const internalShareThreadsUrl = () =>
    `/internal/api/v1/shares/${shareId}/resources/${resourceId}/comment-threads`;

  beforeAll(async () => {
    owner = await TestClient.create();
    commenter = await TestClient.create();
    outsider = await TestClient.create();

    const invitation = await owner
      .post(`/api/v1/namespaces/${owner.namespace.id}/invitations`)
      .send({
        namespaceRole: 'member',
        rootPermission: ResourcePermission.CAN_COMMENT,
      })
      .expect(HttpStatus.CREATED);
    await commenter
      .post(
        `/api/v1/namespaces/${owner.namespace.id}/invitations/${invitation.body.id}/accept`,
      )
      .expect(HttpStatus.CREATED);

    const content = 'Alpha selected text omega';
    const resource = await owner
      .post(`/api/v1/namespaces/${owner.namespace.id}/resources`)
      .send({
        name: 'Commented document',
        namespaceId: owner.namespace.id,
        resourceType: ResourceType.DOC,
        parentId: owner.namespace.root_resource_id,
        content,
      })
      .expect(HttpStatus.CREATED);
    resourceId = resource.body.id;
    const contentHash = createHash('sha256').update(content).digest('hex');
    const resourceUrl = `/api/v1/namespaces/${owner.namespace.id}/resources/${resourceId}`;

    const resolvedThread = await owner
      .post(`${resourceUrl}/comment-threads`)
      .send({
        quoted_text: 'Alpha',
        anchor_from: 0,
        anchor_to: 5,
        expected_content_hash: contentHash,
        content: 'Resolved question',
      })
      .expect(HttpStatus.CREATED);
    resolvedThreadId = resolvedThread.body.thread.id;
    await owner
      .patch(`${resourceUrl}/comment-threads/${resolvedThreadId}`)
      .send({ resolved: true })
      .expect(HttpStatus.OK);

    const openThread = await commenter
      .post(`${resourceUrl}/comment-threads`)
      .send({
        quoted_text: 'selected text',
        anchor_from: 6,
        anchor_to: 19,
        expected_content_hash: contentHash,
        content: 'Open question',
      })
      .expect(HttpStatus.CREATED);
    openThreadId = openThread.body.thread.id;

    const upload = await owner
      .post(`${resourceUrl}/comment-attachments`)
      .attach('file', commentPng, {
        filename: 'reply.png',
        contentType: 'image/png',
      })
      .expect(HttpStatus.CREATED);
    attachmentId = upload.body.id;
    await owner
      .post(`${resourceUrl}/comment-threads/${openThreadId}/comments`)
      .send({ content: 'Reply with image', attachment_ids: [attachmentId] })
      .expect(HttpStatus.CREATED);

    shareId = (
      await owner
        .patch(`${resourceUrl}/share`)
        .send({ enabled: true, all_resources: true, share_type: 'all' })
        .expect(HttpStatus.OK)
    ).body.id;
  });

  afterAll(async () => {
    await outsider?.close();
    await commenter?.close();
    await owner?.close();
  });

  it('lists threads with their comments for a user who can view', async () => {
    const response = await commenter
      .request()
      .get(internalThreadsUrl())
      .set('x-user-id', commenter.user.id)
      .expect(HttpStatus.OK);

    expect(response.body).toMatchObject({
      total: 2,
      offset: 0,
      limit: 20,
      has_more: false,
    });
    expect(response.body.items.map((item: { id: string }) => item.id)).toEqual([
      openThreadId,
      resolvedThreadId,
    ]);
    const [open, resolved] = response.body.items;
    expect(open).toMatchObject({
      quoted_text: 'selected text',
      resolved: false,
      creator: { id: commenter.user.id, username: commenter.user.username },
    });
    expect(
      open.comments.map((item: { content: string }) => item.content),
    ).toEqual(['Open question', 'Reply with image']);
    expect(open.comments[1].author).toEqual({
      id: owner.user.id,
      username: owner.user.username,
    });
    expect(open.comments[1].attachments[0]).toMatchObject({
      id: attachmentId,
      name: 'reply.png',
      url: `/api/v1/namespaces/${owner.namespace.id}/resources/${resourceId}/comment-attachments/${attachmentId}`,
    });
    expect(resolved).toMatchObject({
      id: resolvedThreadId,
      resolved: true,
      comments: [{ content: 'Resolved question' }],
    });
  });

  it('respects offset, limit and the resolved filter', async () => {
    const page = await owner
      .request()
      .get(`${internalThreadsUrl()}?offset=1&limit=1`)
      .set('x-user-id', owner.user.id)
      .expect(HttpStatus.OK);
    expect(page.body).toMatchObject({
      total: 2,
      offset: 1,
      limit: 1,
      has_more: false,
    });
    expect(page.body.items).toHaveLength(1);
    expect(page.body.items[0].id).toBe(resolvedThreadId);

    const firstPage = await owner
      .request()
      .get(`${internalThreadsUrl()}?offset=0&limit=1`)
      .set('x-user-id', owner.user.id)
      .expect(HttpStatus.OK);
    expect(firstPage.body.has_more).toBe(true);

    const unresolved = await owner
      .request()
      .get(`${internalThreadsUrl()}?resolved=false`)
      .set('x-user-id', owner.user.id)
      .expect(HttpStatus.OK);
    expect(unresolved.body.total).toBe(1);
    expect(unresolved.body.items[0].id).toBe(openThreadId);

    const resolved = await owner
      .request()
      .get(`${internalThreadsUrl()}?resolved=true`)
      .set('x-user-id', owner.user.id)
      .expect(HttpStatus.OK);
    expect(resolved.body.total).toBe(1);
    expect(resolved.body.items[0].id).toBe(resolvedThreadId);

    await owner
      .request()
      .get(`${internalThreadsUrl()}?limit=101`)
      .set('x-user-id', owner.user.id)
      .expect(HttpStatus.BAD_REQUEST);
  });

  it('rejects a user without view permission and a missing user header', async () => {
    await owner
      .request()
      .get(internalThreadsUrl())
      .set('x-user-id', outsider.user.id)
      .expect(HttpStatus.FORBIDDEN);

    await owner
      .request()
      .get(internalThreadsUrl())
      .expect(HttpStatus.UNAUTHORIZED);
  });

  it('lists a shared resource threads with share-scoped attachment urls', async () => {
    const response = await owner
      .request()
      .get(`${internalShareThreadsUrl()}?resolved=false`)
      .expect(HttpStatus.OK);

    expect(response.body).toMatchObject({
      total: 1,
      offset: 0,
      limit: 20,
      has_more: false,
    });
    expect(response.body.items[0].id).toBe(openThreadId);
    expect(response.body.items[0].comments[1].attachments[0].url).toBe(
      `/api/v1/shares/${shareId}/resources/${resourceId}/comment-attachments/${attachmentId}`,
    );
  });

  it('refuses a resource outside the share', async () => {
    await owner
      .request()
      .get(
        `/internal/api/v1/shares/${shareId}/resources/${owner.namespace.root_resource_id}/comment-threads`,
      )
      .expect(HttpStatus.NOT_FOUND);
  });
});
