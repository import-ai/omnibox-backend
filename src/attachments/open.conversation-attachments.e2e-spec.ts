import {
  APIKeyPermissionTarget,
  APIKeyPermissionType,
} from 'omniboxd/api-key/api-key.entity';
import { TestClient } from 'test/test-client';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('OpenConversationAttachmentsController (e2e)', () => {
  let client: TestClient;
  let otherClient: TestClient;
  let chatApiKeyValue: string;
  let conversationId: string;
  let foreignConversationId: string;

  beforeAll(async () => {
    client = await TestClient.create();
    otherClient = await TestClient.create();

    const conversation = await client
      .post(`/api/v1/namespaces/${client.namespace.id}/conversations`)
      .expect(201);
    conversationId = conversation.body.id as string;

    const foreignConversation = await otherClient
      .post(`/api/v1/namespaces/${otherClient.namespace.id}/conversations`)
      .expect(201);
    foreignConversationId = foreignConversation.body.id as string;

    const chatApiKey = await client
      .post('/api/v1/api-keys')
      .send({
        user_id: client.user.id,
        namespace_id: client.namespace.id,
        attrs: {
          root_resource_id: client.namespace.root_resource_id,
          permissions: [
            {
              target: APIKeyPermissionTarget.CHAT,
              permissions: [APIKeyPermissionType.CREATE],
            },
          ],
        },
      })
      .expect(201);
    chatApiKeyValue = chatApiKey.body.value as string;
  });

  afterAll(async () => {
    await client.close();
    await otherClient.close();
  });

  const uploadUrl = (id: string) =>
    `/open/api/v1/conversations/${id}/attachments`;

  it('uploads a conversation attachment and downloads it with the owner JWT', async () => {
    const upload = await client
      .request()
      .post(uploadUrl(conversationId))
      .set('Authorization', `Bearer ${chatApiKeyValue}`)
      .attach('file[]', Buffer.from('apple'), {
        filename: 'apple.png',
        contentType: 'image/png',
      })
      .expect(201);

    expect(upload.body.attachment_id).toMatch(UUID_PATTERN);
    expect(upload.body).toMatchObject({
      name: 'apple.png',
      preview_url: `/api/v1/namespaces/${client.namespace.id}/conversations/${conversationId}/attachments/${upload.body.attachment_id}`,
    });

    const download = await client
      .get(
        `/api/v1/namespaces/${client.namespace.id}/conversations/${conversationId}/attachments/${upload.body.attachment_id}`,
      )
      .expect(200);
    expect(Buffer.from(download.body).toString()).toBe('apple');
  });

  it('rejects an upload without a file', async () => {
    const missing = await client
      .request()
      .post(uploadUrl(conversationId))
      .set('Authorization', `Bearer ${chatApiKeyValue}`)
      .field('note', 'no file')
      .expect(400);
    expect(missing.body.code).toBe('attachment_file_required');

    const empty = await client
      .request()
      .post(uploadUrl(conversationId))
      .set('Authorization', `Bearer ${chatApiKeyValue}`)
      .attach('file[]', Buffer.alloc(0), {
        filename: 'empty.png',
        contentType: 'image/png',
      })
      .expect(400);
    expect(empty.body.code).toBe('attachment_file_empty');
  });

  it('rejects an upload without an API key', async () => {
    await client
      .request()
      .post(uploadUrl(conversationId))
      .attach('file[]', Buffer.from('apple'), 'apple.png')
      .expect(401);
  });

  it('rejects a key without the chat permission', async () => {
    const response = await client
      .request()
      .post(uploadUrl(conversationId))
      .set('Authorization', `Bearer ${client.apiKey.value}`)
      .attach('file[]', Buffer.from('apple'), 'apple.png')
      .expect(403);
    expect(response.body.code).toBe('no_permission_for_target');
  });

  it("rejects a conversation the API key's user does not own", async () => {
    const response = await client
      .request()
      .post(uploadUrl(foreignConversationId))
      .set('Authorization', `Bearer ${chatApiKeyValue}`)
      .attach('file[]', Buffer.from('apple'), 'apple.png')
      .expect(403);
    expect(response.body.code).toBe('conversation_access_denied');
  });
});
