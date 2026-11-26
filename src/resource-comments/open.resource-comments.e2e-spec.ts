import { createHash, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';
import { TestClient } from 'test/test-client';
import { DataSource } from 'typeorm';

import { ResourceComment } from './entities/resource-comment.entity';
import { ResourceCommentAttachment } from './entities/resource-comment-attachment.entity';
import {
  ResourceCommentAnchorStatus,
  ResourceCommentThread,
  ResourceCommentThreadType,
} from './entities/resource-comment-thread.entity';

describe('Open resource comments (e2e)', () => {
  let owner: TestClient;
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

  beforeAll(async () => {
    owner = await TestClient.create();
    db = owner.app.get(DataSource);
  });

  beforeEach(async () => {
    resourceId = await createResource();
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    await owner?.close();
  });

  it('reads both comment types using only an API key and preserves Web defaults', async () => {
    const document = await createThread();
    const inline = await createThread('inline');
    const response = (await read().expect(200)).body;
    expect(response).toMatchObject({
      total: 2,
      offset: 0,
      limit: 20,
      has_more: false,
    });
    expect(response.items.map((item: { id: string }) => item.id)).toEqual([
      document.id,
      inline.id,
    ]);
    expect(response.items[0]).toMatchObject({
      type: 'document',
      quoted_text: '',
      anchor: null,
      creator: { id: owner.user.id, display_name: owner.user.username },
      comments_pagination: { total: 1, offset: 0, limit: 1, has_more: false },
    });
    expect(response.items[0].comments[0].author).toEqual({
      id: owner.user.id,
      display_name: owner.user.username,
    });
    const web = (await owner.get(webPath()).expect(200)).body;
    expect(web.items.map((item: { id: string }) => item.id)).toEqual([
      inline.id,
    ]);
  });

  it('filters thread totals by type and resolved while retaining orphaned anchors', async () => {
    await createThread();
    const inline = await createThread('inline');
    await db.getRepository(ResourceCommentThread).update(inline.id, {
      resolvedAt: new Date(),
      anchorStatus: ResourceCommentAnchorStatus.ORPHANED,
    });
    const filtered = (
      await read().query({ type: 'inline', resolved: 'true' }).expect(200)
    ).body;
    expect(filtered.total).toBe(1);
    expect(filtered.items[0]).toMatchObject({
      id: inline.id,
      resolved: true,
      anchor: { status: 'orphaned', from: 0, to: 8 },
    });
    expect(
      (await read().query({ resolved: 'false' }).expect(200)).body.total,
    ).toBe(1);
  });

  it('returns empty pages and accurate totals beyond the end', async () => {
    expect((await read().expect(200)).body).toEqual({
      items: [],
      total: 0,
      offset: 0,
      limit: 20,
      has_more: false,
    });
    const thread = await createThread();
    expect(
      (await read().query({ offset: 100 }).expect(200)).body,
    ).toMatchObject({
      items: [],
      total: 1,
      offset: 100,
      has_more: false,
    });
    expect(
      (
        await read(`${openPath()}/${thread.id}/comments`)
          .query({ offset: 100 })
          .expect(200)
      ).body,
    ).toMatchObject({ items: [], total: 1, has_more: false });
  });

  it('paginates threads deterministically when creation times are equal', async () => {
    const threads = Array.from({ length: 25 }, () => ({
      id: randomUUID(),
      namespaceId: owner.namespace.id,
      resourceId,
      creatorId: owner.user.id,
      type: ResourceCommentThreadType.DOCUMENT,
      quotedText: '',
      anchorStatus: null,
      anchorPrefix: null,
      anchorSuffix: null,
      createdAt: new Date('2026-11-20T00:00:00Z'),
    }));
    await db.getRepository(ResourceCommentThread).insert(threads);
    await db.getRepository(ResourceComment).insert(
      threads.map((thread) => ({
        threadId: thread.id,
        authorId: owner.user.id,
        content: 'Comment',
      })),
    );
    const first = (await read().expect(200)).body;
    const second = (await read().query({ offset: 20 }).expect(200)).body;
    expect(first.has_more).toBe(true);
    expect(second.has_more).toBe(false);
    expect(
      [...first.items, ...second.items].map((item: { id: string }) => item.id),
    ).toEqual(threads.map((thread) => thread.id).sort());
  });

  it('bounds previews and reads 105 replies in two stable pages', async () => {
    const thread = await createThread('inline');
    await db.getRepository(ResourceComment).delete({ threadId: thread.id });
    const rows = Array.from({ length: 105 }, (_, index) => ({
      id: randomUUID(),
      threadId: thread.id,
      authorId: owner.user.id,
      content: `Reply ${index}`,
      createdAt: new Date('2026-11-20T00:00:00Z'),
    }));
    await db.getRepository(ResourceComment).insert(rows);
    const orderedIds = rows.map((row) => row.id).sort();
    const preview = (await read().expect(200)).body.items[0];
    expect(preview.comments).toHaveLength(1);
    expect(preview.comments[0].id).toBe(orderedIds[0]);
    expect(preview.comments_pagination).toEqual({
      total: 105,
      offset: 0,
      limit: 1,
      has_more: true,
    });
    const path = `${openPath()}/${thread.id}/comments`;
    const first = (await read(path).query({ limit: 100 }).expect(200)).body;
    const last = (
      await read(path).query({ offset: 100, limit: 100 }).expect(200)
    ).body;
    expect(first.items).toHaveLength(100);
    expect(last.items).toHaveLength(5);
    expect(last.has_more).toBe(false);
    expect(
      [...first.items, ...last.items].map((item: { id: string }) => item.id),
    ).toEqual(orderedIds);
    const continued = (
      await read(path).query({ offset: 1, limit: 100 }).expect(200)
    ).body;
    expect(continued.items[0].id).toBe(orderedIds[1]);
  });

  it('keeps replies after deleting the original comment and excludes soft deletions', async () => {
    const thread = await createThread('inline');
    const reply = (
      await owner
        .post(`${webPath()}/${thread.id}/comments`)
        .send({ content: 'Surviving reply' })
        .expect(201)
    ).body;
    await owner
      .delete(`${webPath()}/${thread.id}/comments/${thread.comments[0].id}`)
      .expect(200);
    const preview = (await read().expect(200)).body.items[0];
    expect(preview.comments).toHaveLength(1);
    expect(preview.comments[0].content).toBe('Surviving reply');
    expect(preview.comments_pagination.total).toBe(1);
    expect(reply).toBeDefined();
    await owner.delete(`${webPath()}/${thread.id}`).expect(200);
    expect((await read().expect(200)).body.total).toBe(0);
    await read(`${openPath()}/${thread.id}/comments`).expect(404);
  });

  it('keeps image-only comments without exposing storage fields or multiplying pages', async () => {
    const thread = await createThread();
    const commentId = thread.comments[0].id;
    await db.getRepository(ResourceComment).update(commentId, { content: '' });
    const attachments = Array.from({ length: 9 }, (_, index) => ({
      namespaceId: owner.namespace.id,
      resourceId,
      commentId,
      uploaderId: owner.user.id,
      storageUserId: owner.user.id,
      objectKey: `private/comment/${randomUUID()}`,
      name: `${index}.png`,
      mimetype: 'image/png',
      size: 42,
    }));
    const saved = await db
      .getRepository(ResourceCommentAttachment)
      .save(attachments);
    await db.getRepository(ResourceCommentAttachment).softDelete(saved[0].id);
    const page = (
      await read(`${openPath()}/${thread.id}/comments`)
        .query({ limit: 1 })
        .expect(200)
    ).body;
    expect(page.total).toBe(1);
    expect(page.items).toHaveLength(1);
    expect(page.items[0].content).toBe('');
    expect(page.items[0].attachments).toHaveLength(8);
    for (const attachment of page.items[0].attachments) {
      expect(Object.keys(attachment).sort()).toEqual([
        'id',
        'mimetype',
        'name',
        'size',
      ]);
    }
  });

  it('resolves only mention names used on the current comment page', async () => {
    const thread = await createThread('inline');
    await db.getRepository(ResourceComment).update(thread.comments[0].id, {
      content: `Hello [@ id="${owner.user.id}" label="Owner"]`,
    });
    const page = (await read(`${openPath()}/${thread.id}/comments`).expect(200))
      .body;
    expect(page.items[0].content).toContain(owner.user.id);
    expect(page.mention_display_names).toEqual({
      [owner.user.id]: owner.user.username,
    });
  });

  it.each([
    'limit=0',
    'limit=101',
    'offset=-1',
    'offset=1.5',
    'offset=1e2',
    'offset=',
    'offset=9007199254740992',
    'offset=0&offset=1',
    'type=sidebar',
    'resolved=1',
  ])('rejects invalid query %s', async (query) => {
    await read(`${openPath()}?${query}`).expect(400);
  });

  it('rejects invalid, foreign and deleted thread or resource IDs', async () => {
    const thread = await createThread();
    await read(`${openPath()}/invalid/comments`).expect(400);
    const secondId = await createResource();
    await read(
      `/open/api/v1/resources/${secondId}/comment-threads/${thread.id}/comments`,
    ).expect(404);
    await read(`/open/api/v1/resources/missing/comment-threads`).expect(404);
    await db.getRepository(Resource).softDelete(resourceId);
    await read().expect(404);
  });

  it('bounds hydration and query counts for maximum pages, large offsets and long threads', async () => {
    const thread = await createThread('inline');
    const threads = Array.from({ length: 1100 }, (_, index) => ({
      id: randomUUID(),
      namespaceId: owner.namespace.id,
      resourceId,
      creatorId: owner.user.id,
      type: ResourceCommentThreadType.DOCUMENT,
      quotedText: '',
      anchorStatus: null,
      anchorPrefix: null,
      anchorSuffix: null,
      createdAt: new Date(Date.now() + 1000 + index),
    }));
    await db.getRepository(ResourceCommentThread).insert(threads);
    await db.getRepository(ResourceComment).insert(
      threads.map((item) => ({
        threadId: item.id,
        authorId: owner.user.id,
        content: 'x'.repeat(1000),
      })),
    );
    const rows = Array.from({ length: 10000 }, (_, index) => ({
      threadId: thread.id,
      authorId: owner.user.id,
      content: `Reply ${index} ${'x'.repeat(1000)}`,
    }));
    await db.getRepository(ResourceComment).insert(rows);
    const queries = jest.spyOn(db.logger, 'logQuery');
    let baselineQueries = 0;
    for (const query of [
      { offset: 0, limit: 1 },
      { offset: 0, limit: 100 },
      { offset: 1000, limit: 100 },
    ]) {
      queries.mockClear();
      const started = performance.now();
      const response = await read().query(query).expect(200);
      const queryCount = queries.mock.calls.length;
      if (!baselineQueries) baselineQueries = queryCount;
      expect(queryCount).toBeLessThanOrEqual(baselineQueries + 2);
      expect(response.body.total).toBe(1101);
      expect(response.body.items).toHaveLength(query.limit);
      for (const item of response.body.items)
        expect(item.comments).toHaveLength(1);
      if (query.offset === 0)
        expect(response.body.items[0].comments_pagination.total).toBe(10001);
      expect(Buffer.byteLength(response.text)).toBeLessThan(200000);
      console.info('Open comment preview measurement', {
        ...query,
        queryCount,
        elapsedMs: Math.round(performance.now() - started),
        responseBytes: Buffer.byteLength(response.text),
      });
    }
    queries.mockRestore();
    const plan = await db.query(
      'EXPLAIN (ANALYZE, FORMAT JSON) SELECT id FROM resource_comments WHERE thread_id=$1 AND deleted_at IS NULL ORDER BY created_at, id LIMIT 1',
      [thread.id],
    );
    console.info('Open comment preview query plan', JSON.stringify(plan));
  });
});
