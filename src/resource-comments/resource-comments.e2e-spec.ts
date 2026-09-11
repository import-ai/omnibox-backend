import { createHash } from 'node:crypto';

import { HttpStatus } from '@nestjs/common';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import { TestClient } from 'test/test-client';

describe('Resource comments (e2e)', () => {
  let owner: TestClient;
  let commenter: TestClient;
  let resourceId: string;
  let contentHash: string;
  let firstThreadId: string;
  let firstCommentId: string;
  let secondThreadId: string;
  let overlappingThreadId: string;

  const hash = (content: string) =>
    createHash('sha256').update(content).digest('hex');
  const resourceUrl = () =>
    `/api/v1/namespaces/${owner.namespace.id}/resources/${resourceId}`;
  const threadsUrl = () => `${resourceUrl()}/comment-threads`;

  beforeAll(async () => {
    owner = await TestClient.create();
    commenter = await TestClient.create();

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
    const response = await owner
      .post(`/api/v1/namespaces/${owner.namespace.id}/resources`)
      .send({
        name: 'Commented document',
        namespaceId: owner.namespace.id,
        resourceType: ResourceType.DOC,
        parentId: owner.namespace.root_resource_id,
        content,
      })
      .expect(HttpStatus.CREATED);
    resourceId = response.body.id;
    contentHash = hash(content);
  });

  afterAll(async () => {
    await commenter?.close();
    await owner?.close();
  });

  it('returns comment state with the existing resource detail', async () => {
    const response = await owner.get(resourceUrl()).expect(HttpStatus.OK);

    expect(response.body.content_hash).toBe(contentHash);
    expect(response.body.comment_threads).toEqual([]);
  });

  it('creates separate threads for simultaneous-position comments', async () => {
    const request = {
      quoted_text: 'selected text',
      anchor_from: 7,
      anchor_to: 20,
      anchor_prefix: 'Alpha ',
      anchor_suffix: ' omega',
      expected_content_hash: contentHash,
      content: 'First comment',
    };
    const first = await commenter
      .post(threadsUrl())
      .send(request)
      .expect(HttpStatus.CREATED);
    const second = await owner
      .post(threadsUrl())
      .send({ ...request, content: 'Second comment' })
      .expect(HttpStatus.CREATED);

    expect(first.body.thread_created).toBe(true);
    expect(second.body.thread_created).toBe(true);
    expect(second.body.thread.id).not.toBe(first.body.thread.id);
    expect(first.body.thread.comments).toHaveLength(1);
    expect(second.body.thread.comments).toHaveLength(1);
    firstThreadId = first.body.thread.id;
    firstCommentId = first.body.thread.comments[0].id;
    secondThreadId = second.body.thread.id;

    const resource = await owner.get(resourceUrl()).expect(HttpStatus.OK);
    expect(resource.body.comment_threads).toHaveLength(2);
    expect(resource.body.comment_threads[0].comments).toHaveLength(1);
  });

  it('allows a different overlapping anchor as a separate thread', async () => {
    const response = await owner
      .post(threadsUrl())
      .send({
        quoted_text: 'text omega',
        anchor_from: 15,
        anchor_to: 25,
        expected_content_hash: contentHash,
        content: 'Overlapping comment',
      })
      .expect(HttpStatus.CREATED);

    expect(response.body.thread_created).toBe(true);
    overlappingThreadId = response.body.thread.id;
  });

  it('lists comment threads independently with pagination and filtering', async () => {
    const expectedThreads = [
      { id: overlappingThreadId, content: 'Overlapping comment' },
      { id: secondThreadId, content: 'Second comment' },
      { id: firstThreadId, content: 'First comment' },
    ];

    for (const [offlet, thread] of expectedThreads.entries()) {
      const response = await owner
        .get(`${threadsUrl()}?offlet=${offlet}&limits=1&resolved=false`)
        .expect(HttpStatus.OK);

      expect(response.body).toMatchObject({
        total: 3,
        offlet,
        limits: 1,
        has_more: offlet < 2,
      });
      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].id).toBe(thread.id);
      expect(response.body.items[0].comments).toHaveLength(1);
      expect(response.body.items[0].comments[0].content).toBe(thread.content);
    }

    const resolved = await owner
      .get(`${threadsUrl()}?offlet=0&limits=1&resolved=true`)
      .expect(HttpStatus.OK);

    expect(resolved.body).toMatchObject({
      total: 0,
      offlet: 0,
      limits: 1,
      has_more: false,
      items: [],
    });
  });

  it('allows an author to edit a comment', async () => {
    const response = await commenter
      .patch(`${threadsUrl()}/${firstThreadId}/comments/${firstCommentId}`)
      .send({ content: 'Edited first comment' })
      .expect(HttpStatus.OK);

    expect(
      response.body.comments.find(
        (item: { id: string }) => item.id === firstCommentId,
      ).content,
    ).toBe('Edited first comment');
  });

  it('binds a new image when an author edits a comment', async () => {
    const upload = await commenter
      .post(`${resourceUrl()}/comment-attachments`)
      .attach('file', Buffer.from('edited-image'), {
        filename: 'edit.png',
        contentType: 'image/png',
      })
      .expect(HttpStatus.CREATED);

    const response = await commenter
      .patch(`${threadsUrl()}/${firstThreadId}/comments/${firstCommentId}`)
      .send({
        content: 'Edited with image',
        attachment_ids: [upload.body.id],
      })
      .expect(HttpStatus.OK);

    const updated = response.body.comments.find(
      (item: { id: string }) => item.id === firstCommentId,
    );
    expect(updated.content).toBe('Edited with image');
    expect(updated.attachments).toHaveLength(1);
    expect(updated.attachments[0]).toMatchObject({
      id: upload.body.id,
      name: 'edit.png',
      mimetype: 'image/png',
    });
  });

  it('syncs anchors through the existing resource patch', async () => {
    const current = await owner.get(resourceUrl()).expect(HttpStatus.OK);
    const thread = current.body.comment_threads[0];
    const nextContent = 'Prefix Alpha selected text omega';

    const updated = await owner
      .patch(resourceUrl())
      .send({
        content: nextContent,
        expected_content_hash: current.body.content_hash,
        comment_anchors: [
          {
            thread_id: thread.id,
            from: 14,
            to: 27,
            quoted_text: 'selected text',
            prefix: 'Prefix Alpha ',
            suffix: ' omega',
          },
        ],
      })
      .expect(HttpStatus.OK);

    expect(updated.body.content_hash).toBe(hash(nextContent));
    expect(updated.body.comment_threads[0].anchor).toMatchObject({
      from: 14,
      to: 27,
      content_hash: hash(nextContent),
      status: 'active',
    });

    await owner
      .patch(resourceUrl())
      .send({
        content: 'Stale update',
        expected_content_hash: current.body.content_hash,
        comment_anchors: [],
      })
      .expect(HttpStatus.CONFLICT);
  });

  it('leaves the legacy resource patch contract unchanged', async () => {
    const before = await owner.get(resourceUrl()).expect(HttpStatus.OK);
    const previousAnchorHash =
      before.body.comment_threads[0].anchor.content_hash;
    const legacyContent = 'Legacy editor changed the markdown';

    const response = await owner
      .patch(resourceUrl())
      .send({ content: legacyContent })
      .expect(HttpStatus.OK);

    expect(response.body.content).toBe(legacyContent);
    expect(response.body.content_hash).toBe(hash(legacyContent));
    expect(response.body.comment_threads[0].anchor.content_hash).toBe(
      previousAnchorHash,
    );
  });

  it('uploads and binds a comment image attachment', async () => {
    const upload = await commenter
      .post(`${resourceUrl()}/comment-attachments`)
      .attach('file', Buffer.from('fake-image'), {
        filename: 'reply.png',
        contentType: 'image/png',
      })
      .expect(HttpStatus.CREATED);

    expect(upload.body).toMatchObject({
      name: 'reply.png',
      mimetype: 'image/png',
    });
    expect(upload.body.id).toBeTruthy();
    expect(upload.body.url).toContain(upload.body.id);

    const threads = await owner.get(threadsUrl()).expect(HttpStatus.OK);
    const threadId = threads.body.items[0].id;
    const reply = await commenter
      .post(`${threadsUrl()}/${threadId}/comments`)
      .send({
        content: 'Image reply',
        attachment_ids: [upload.body.id],
      })
      .expect(HttpStatus.CREATED);

    const comment = reply.body.comments.find(
      (item: { content: string }) => item.content === 'Image reply',
    );
    expect(comment.attachments).toHaveLength(1);
    expect(comment.attachments[0]).toMatchObject({
      id: upload.body.id,
      name: 'reply.png',
      mimetype: 'image/png',
    });

    await commenter
      .get(comment.attachments[0].url)
      .expect(HttpStatus.OK)
      .expect('Content-Type', /image\/png/);
  });

  it('allows commenting permission without granting document edits', async () => {
    await commenter
      .post(`${threadsUrl()}/${crypto.randomUUID()}/comments`)
      .send({ content: 'Missing thread' })
      .expect(HttpStatus.NOT_FOUND);

    await commenter
      .patch(resourceUrl())
      .send({ content: 'Forbidden edit' })
      .expect(HttpStatus.FORBIDDEN);
  });
});
