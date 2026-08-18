import { TestClient } from 'test/test-client';

// A chat-only share lends its resources to the assistant, never to a visitor:
// the public read paths are closed while chat and the internal paths that
// build the assistant's visible resources stay open.
describe('Chat-only share (e2e)', () => {
  let client: TestClient;
  let chatOnlyFolderId: string;
  let chatOnlyDocId: string;
  let chatOnlyShareId: string;
  let openShareId: string;

  beforeAll(async () => {
    client = await TestClient.create();

    chatOnlyFolderId = (
      await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .send({
          name: 'Chat only folder',
          resourceType: 'folder',
          parentId: client.namespace.root_resource_id,
        })
        .expect(201)
    ).body.id;
    chatOnlyDocId = (
      await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .send({
          name: 'Chat only doc',
          resourceType: 'doc',
          parentId: chatOnlyFolderId,
        })
        .expect(201)
    ).body.id;

    chatOnlyShareId = (
      await client
        .patch(
          `/api/v1/namespaces/${client.namespace.id}/resources/${chatOnlyFolderId}/share`,
        )
        .send({ enabled: true, all_resources: true, share_type: 'chat_only' })
        .expect(200)
    ).body.id;

    // The same tree shared with everything on, to prove each 403 below comes
    // from the share type and not from the request itself.
    const openFolderId = (
      await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .send({
          name: 'Open folder',
          resourceType: 'folder',
          parentId: client.namespace.root_resource_id,
        })
        .expect(201)
    ).body.id;
    openShareId = (
      await client
        .patch(
          `/api/v1/namespaces/${client.namespace.id}/resources/${openFolderId}/share`,
        )
        .send({ enabled: true, all_resources: true, share_type: 'all' })
        .expect(200)
    ).body.id;
  });

  afterAll(async () => {
    await client.close();
  });

  // client.request() sends no auth headers — a public viewer.
  const asViewer = () => client.request();

  it('refuses to serve a resource, its children, its rss items or its attachments', async () => {
    const detail = await asViewer()
      .get(`/api/v1/shares/${chatOnlyShareId}/resources/${chatOnlyDocId}`)
      .expect(403);
    expect(detail.body.code).toBe('resource_not_allowed');

    await asViewer()
      .get(
        `/api/v1/shares/${chatOnlyShareId}/resources/${chatOnlyFolderId}/children`,
      )
      .expect(403);
    await asViewer()
      .get(
        `/api/v1/shares/${chatOnlyShareId}/resources/${chatOnlyFolderId}/rss-items`,
      )
      .expect(403);
    await asViewer()
      .get(
        `/api/v1/shares/${chatOnlyShareId}/resources/${chatOnlyFolderId}/rss-items/anyitem0001`,
      )
      .expect(403);
    await asViewer()
      .get(
        `/api/v1/shares/${chatOnlyShareId}/resources/${chatOnlyDocId}/attachments/anyattach01`,
      )
      .expect(403);
  });

  it('leaves the same endpoints open on a share that grants resources', async () => {
    await asViewer()
      .get(`/api/v1/shares/${openShareId}/resources/${chatOnlyDocId}`)
      .expect((response) => expect(response.status).not.toBe(403));
    await asViewer()
      .get(`/api/v1/shares/${openShareId}/resources/${chatOnlyDocId}/children`)
      .expect((response) => expect(response.status).not.toBe(403));
    await asViewer()
      .get(
        `/api/v1/shares/${openShareId}/resources/${chatOnlyDocId}/attachments/anyattach01`,
      )
      .expect((response) => expect(response.status).not.toBe(403));
  });

  it('still describes itself to a visitor', async () => {
    const info = await asViewer()
      .get(`/api/v1/shares/${chatOnlyShareId}`)
      .expect(200);
    expect(info.body.share_type).toBe('chat_only');
  });

  it('still lets a visitor open a conversation', async () => {
    const conversation = await asViewer()
      .post(`/api/v1/shares/${chatOnlyShareId}/conversations`)
      .expect(201);
    expect(conversation.body.id).toBeTruthy();
  });

  it('still exposes the resources the assistant reads', async () => {
    const roots = await asViewer()
      .get(`/internal/api/v1/shares/${chatOnlyShareId}/resources/roots`)
      .expect(200);
    expect(roots.body.root.id).toBe(chatOnlyFolderId);

    const listed = await asViewer()
      .get(
        `/internal/api/v1/shares/${chatOnlyShareId}/resources/${chatOnlyFolderId}/list`,
      )
      .expect(200);
    expect(
      listed.body.resources.map((child: { name: string }) => child.name),
    ).toContain('Chat only doc');

    await asViewer()
      .get(
        `/internal/api/v1/shares/${chatOnlyShareId}/resources/${chatOnlyDocId}`,
      )
      .expect(200);
  });
});
