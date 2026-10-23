import { createHash } from 'node:crypto';

import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import { ResourceRevisionService } from 'omniboxd/resources/resource-revision.service';
import { ShareAccessTokenService } from 'omniboxd/shares/share-access-token.service';
import { commentPng } from 'test/comment-image-fixture';
import { TestClient } from 'test/test-client';
import { DataSource } from 'typeorm';

import { ResourceComment } from './entities/resource-comment.entity';
import { ResourceCommentThread } from './entities/resource-comment-thread.entity';

describe('Document comments (e2e)', () => {
  let owner: TestClient;
  let author: TestClient;
  let resourceId: string;
  let resourceSequence = 0;
  const content = 'Original document';
  const hash = createHash('sha256').update(content).digest('hex');
  const resourceUrl = () =>
    `/api/v1/namespaces/${owner.namespace.id}/resources/${resourceId}`;
  const threadsUrl = () => `${resourceUrl()}/comment-threads`;

  beforeAll(async () => {
    owner = await TestClient.create();
    author = await TestClient.create();
    const invitation = await owner
      .post(`/api/v1/namespaces/${owner.namespace.id}/invitations`)
      .send({
        namespaceRole: 'member',
        rootPermission: ResourcePermission.CAN_COMMENT,
      })
      .expect(201);
    await author
      .post(
        `/api/v1/namespaces/${owner.namespace.id}/invitations/${invitation.body.id}/accept`,
      )
      .expect(201);
  });

  beforeEach(async () => {
    resourceId = (
      await owner
        .post(`/api/v1/namespaces/${owner.namespace.id}/resources`)
        .send({
          name: `Document comments ${++resourceSequence}`,
          namespaceId: owner.namespace.id,
          parentId: owner.namespace.root_resource_id,
          resourceType: ResourceType.DOC,
          content,
        })
        .expect(201)
    ).body.id;
  });

  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    await author?.close();
    await owner?.close();
  });

  const createDocument = async (text = 'Document comment') =>
    (
      await author
        .post(threadsUrl())
        .send({ type: 'document', content: text })
        .expect(201)
    ).body.thread;
  const createInline = async () =>
    (
      await author
        .post(threadsUrl())
        .send({
          quoted_text: 'Original',
          anchor_from: 0,
          anchor_to: 8,
          expected_content_hash: hash,
          content: 'Inline comment',
        })
        .expect(201)
    ).body.thread;

  it('stores null anchors and keeps legacy embedded/list comments inline-only', async () => {
    const document = await createDocument();
    expect(document).toMatchObject({
      type: 'document',
      quoted_text: '',
      anchor: null,
    });
    const row = await owner.app
      .get(DataSource)
      .getRepository(ResourceCommentThread)
      .findOneByOrFail({ id: document.id });
    expect(row).toMatchObject({
      anchorFrom: null,
      anchorTo: null,
      anchorPrefix: null,
      anchorSuffix: null,
      contentHash: null,
      anchorStatus: null,
      quotedText: '',
    });
    const inline = await createInline();
    const detail = (await owner.get(resourceUrl()).expect(200)).body;
    expect(detail.content).toBe(content);
    expect(detail.content_hash).toBe(hash);
    expect(
      detail.comment_threads.map((thread: { id: string }) => thread.id),
    ).toEqual([inline.id]);
    expect(
      (await owner.get(threadsUrl()).expect(200)).body.items.map(
        (thread: { id: string }) => thread.id,
      ),
    ).toEqual([inline.id]);
  });

  it('rejects document anchors, missing inline anchors, empty comments and replies', async () => {
    await author
      .post(threadsUrl())
      .send({ type: 'document', content: 'Comment', anchor_from: 0 })
      .expect(400);
    await author
      .post(threadsUrl())
      .send({ content: 'Missing anchor' })
      .expect(400);
    await author
      .post(threadsUrl())
      .send({ type: 'document', content: ' ' })
      .expect(400);
    const document = await createDocument();
    await author
      .post(`${threadsUrl()}/${document.id}/comments`)
      .send({ content: 'Reply' })
      .expect(400);
  });

  it('binds and soft-deletes an image-only comment using the existing attachment lifecycle', async () => {
    const image = (
      await author
        .post(`${resourceUrl()}/comment-attachments`)
        .attach('file', commentPng, {
          filename: 'comment.png',
          contentType: 'image/png',
        })
        .expect(201)
    ).body;
    const document = (
      await author
        .post(threadsUrl())
        .send({ type: 'document', attachment_ids: [image.id] })
        .expect(201)
    ).body.thread;
    expect(document.comments[0].attachments[0].id).toBe(image.id);
    await owner.delete(`${threadsUrl()}/${document.id}`).expect(403);
    await owner
      .delete(
        `${threadsUrl()}/${document.id}/comments/${document.comments[0].id}`,
      )
      .expect(403);
    await author.delete(`${threadsUrl()}/${document.id}`).expect(200);
    await author.get(`${threadsUrl()}/${document.id}`).expect(404);
    // Soft deletion keeps the attachment until the existing cleanup reclaims it.
    await author
      .get(`${resourceUrl()}/comment-attachments/${image.id}`)
      .expect(200);
    const db = owner.app.get(DataSource);
    expect(
      (
        await db
          .getRepository(ResourceCommentThread)
          .findOne({ where: { id: document.id }, withDeleted: true })
      )?.deletedAt,
    ).toBeInstanceOf(Date);
    expect(
      (
        await db.getRepository(ResourceComment).findOne({
          where: { id: document.comments[0].id },
          withDeleted: true,
        })
      )?.deletedAt,
    ).toBeInstanceOf(Date);
  });

  it('pages 25 same-time threads stably and locates threads outside the loaded page', async () => {
    const ids: string[] = [];
    for (let index = 0; index < 25; index++)
      ids.push((await createDocument(`Comment ${index}`)).id);
    await owner.app
      .get(DataSource)
      .query(
        'UPDATE resource_comment_threads SET created_at = $1 WHERE resource_id = $2',
        [new Date('2026-10-20T00:00:00Z'), resourceId],
      );
    const sortedIds = [...ids].sort();
    const first = (
      await owner
        .get(`${threadsUrl()}?view=document&resolved=false&limit=20`)
        .expect(200)
    ).body;
    const second = (
      await owner
        .get(`${threadsUrl()}?view=document&resolved=false&offset=20&limit=20`)
        .expect(200)
    ).body;
    expect(first.items.map((thread: { id: string }) => thread.id)).toEqual(
      sortedIds.slice(0, 20),
    );
    expect(first).toMatchObject({ total: 25, has_more: true });
    expect(second.items.map((thread: { id: string }) => thread.id)).toEqual(
      sortedIds.slice(20),
    );
    expect(second).toMatchObject({ total: 25, has_more: false });
    await owner.get(`${threadsUrl()}/${sortedIds[24]}`).expect(200);
    await owner.delete(`${threadsUrl()}/${sortedIds[24]}`).expect(403);
    await author.delete(`${threadsUrl()}/${sortedIds[24]}`).expect(200);
    expect(
      (await owner.get(`${threadsUrl()}?view=document`).expect(200)).body.total,
    ).toBe(24);
    await owner.get(`${threadsUrl()}/${sortedIds[24]}`).expect(404);
  });

  it('moves resolved documents into the sidebar while retaining original creation time', async () => {
    const document = await createDocument();
    const inline = await createInline();
    await owner
      .patch(`${threadsUrl()}/${document.id}`)
      .send({ resolved: true })
      .expect(200);
    const sidebar = (
      await owner.get(`${threadsUrl()}?view=sidebar`).expect(200)
    ).body;
    expect(sidebar.items.map((thread: { id: string }) => thread.id)).toEqual([
      inline.id,
      document.id,
    ]);
    expect(sidebar.items[1].created_at).toBe(document.created_at);
    expect(
      (
        await owner
          .get(`${threadsUrl()}?view=document&resolved=false`)
          .expect(200)
      ).body.total,
    ).toBe(0);
    const reopened = (
      await owner
        .patch(`${threadsUrl()}/${document.id}`)
        .send({ resolved: false })
        .expect(200)
    ).body;
    expect(reopened.created_at).toBe(document.created_at);
    expect(
      (
        await owner.get(`${threadsUrl()}?view=sidebar`).expect(200)
      ).body.items.map((thread: { id: string }) => thread.id),
    ).toEqual([inline.id]);
  });

  it('validates direct shared reads and rewrites attachment URLs for public and internal shares', async () => {
    const image = (
      await author
        .post(`${resourceUrl()}/comment-attachments`)
        .attach('file', commentPng, {
          filename: 'comment.png',
          contentType: 'image/png',
        })
        .expect(201)
    ).body;
    const document = (
      await author
        .post(threadsUrl())
        .send({ type: 'document', attachment_ids: [image.id] })
        .expect(201)
    ).body.thread;
    const share = (
      await owner
        .patch(`${resourceUrl()}/share`)
        .send({ enabled: true, all_resources: true, share_type: 'all' })
        .expect(200)
    ).body;
    const publicPath = `/api/v1/shares/${share.id}/resources/${resourceId}/comment-threads/${document.id}`;
    const publicThread = (await owner.request().get(publicPath).expect(200))
      .body;
    expect(publicThread.comments[0].attachments[0].url).toBe(
      `/api/v1/shares/${share.id}/resources/${resourceId}/comment-attachments/${image.id}`,
    );
    const internalThread = (
      await owner
        .request()
        .get(publicPath.replace('/api/', '/internal/api/'))
        .set(
          'x-share-access',
          owner.app.get(ShareAccessTokenService).mint(share.id),
        )
        .expect(200)
    ).body;
    expect(internalThread).toEqual(publicThread);
    await owner
      .request()
      .get(publicPath.replace(resourceId, 'outside-share'))
      .expect(404);
    await owner
      .patch(`${resourceUrl()}/share`)
      .send({ enabled: false })
      .expect(200);
    await owner.request().get(publicPath).expect(404);
  });

  it('rejects document ids in anchor synchronization and preserves document comments during history restore', async () => {
    jest
      .spyOn(owner.app.get(ResourceRevisionService), 'historyLimit')
      .mockResolvedValue(10);
    const document = await createDocument();
    const inline = await createInline();
    await owner
      .patch(resourceUrl())
      .send({
        content: 'Changed',
        expected_content_hash: hash,
        comment_anchors: [
          { thread_id: document.id, from: 0, to: 1, quoted_text: 'C' },
        ],
      })
      .expect(400);
    await owner
      .patch(resourceUrl())
      .send({
        content: 'Changed',
        expected_content_hash: hash,
        comment_anchors: [],
        orphaned_comment_thread_ids: [document.id],
      })
      .expect(400);
    expect((await owner.get(resourceUrl()).expect(200)).body.content).toBe(
      content,
    );
    await owner.patch(resourceUrl()).send({ content: 'Changed' }).expect(200);
    const revisions = (
      await owner.get(`${resourceUrl()}/revisions`).expect(200)
    ).body;
    await owner
      .post(`${resourceUrl()}/revisions/${revisions[1].id}/restore`)
      .expect(201);
    const restoredDocument = (
      await owner.get(`${threadsUrl()}/${document.id}`).expect(200)
    ).body;
    expect(restoredDocument).toMatchObject({
      type: 'document',
      anchor: null,
      created_at: document.created_at,
    });
    const restoredInline = (
      await owner.get(`${threadsUrl()}/${inline.id}`).expect(200)
    ).body;
    expect(restoredInline.anchor.status).toBe('orphaned');
  });
});
