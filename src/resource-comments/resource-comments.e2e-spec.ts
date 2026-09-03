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

  it('merges simultaneous-position comments into one thread', async () => {
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
    expect(second.body.thread_created).toBe(false);
    expect(second.body.thread.id).toBe(first.body.thread.id);
    expect(second.body.thread.comments).toHaveLength(2);

    const resource = await owner.get(resourceUrl()).expect(HttpStatus.OK);
    expect(resource.body.comment_threads).toHaveLength(1);
    expect(resource.body.comment_threads[0].comments).toHaveLength(2);
  });

  it('rejects a different overlapping anchor', async () => {
    const response = await owner
      .post(threadsUrl())
      .send({
        quoted_text: 'text omega',
        anchor_from: 15,
        anchor_to: 25,
        expected_content_hash: contentHash,
        content: 'Overlapping comment',
      })
      .expect(HttpStatus.CONFLICT);

    expect(response.body.code).toBe('comment_anchor_overlap');
  });

  it('lists comment threads independently with pagination and filtering', async () => {
    const response = await owner
      .get(`${threadsUrl()}?offlet=0&limits=1&resolved=false`)
      .expect(HttpStatus.OK);

    expect(response.body).toMatchObject({
      total: 1,
      offlet: 0,
      limits: 1,
      has_more: false,
    });
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].comments).toHaveLength(2);
  });

  it('allows an author to edit a comment', async () => {
    const threads = await owner.get(threadsUrl()).expect(HttpStatus.OK);
    const thread = threads.body.items[0];
    const comment = thread.comments.find(
      (item: { content: string }) => item.content === 'First comment',
    );

    const response = await commenter
      .patch(`${threadsUrl()}/${thread.id}/comments/${comment.id}`)
      .send({ content: 'Edited first comment' })
      .expect(HttpStatus.OK);

    expect(
      response.body.comments.find(
        (item: { id: string }) => item.id === comment.id,
      ).content,
    ).toBe('Edited first comment');
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
