import { TestClient } from 'test/test-client';
import { APIKeyPermissionTarget, APIKeyPermissionType } from './api-key.entity';

process.env.OBB_WIZARD_BASE_URL = 'http://localhost:8000';

// Mock the WizardAPIService to avoid needing the actual wizard service during tests
jest.mock('../wizard/api.wizard.service', () => {
  return {
    WizardAPIService: jest.fn().mockImplementation(() => ({
      request: jest.fn().mockResolvedValue({ success: true }),
      proxy: jest.fn().mockResolvedValue({ success: true }),
      search: jest.fn().mockResolvedValue({ results: [] }),
    })),
  };
});

// Mock fetch for any direct fetch calls
global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  json: jest.fn().mockResolvedValue({ success: true }),
  text: jest.fn().mockResolvedValue('success'),
  status: 200,
  body: {
    getReader: jest.fn().mockReturnValue({
      read: jest
        .fn()
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode(
            'data: {"response_type":"bos","role":"assistant","id":"test-msg-id"}\n',
          ),
        })
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode(
            'data: {"response_type":"delta","message":{"content":"Hello"}}\n',
          ),
        })
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode('data: {"response_type":"eos"}\n'),
        })
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode('data: {"response_type":"done"}\n'),
        })
        .mockResolvedValueOnce({ done: true, value: undefined }),
      cancel: jest.fn(),
    }),
  },
}) as jest.MockedFunction<typeof fetch>;

describe('OpenAPIKeyController (e2e)', () => {
  let client: TestClient;
  let chatApiKeyValue: string;
  let noChatApiKeyValue: string;

  beforeAll(async () => {
    client = await TestClient.create();

    // Create an API key with CHAT CREATE permissions for testing
    const chatApiKeyData = {
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
    };

    const chatResponse = await client
      .post('/api/v1/api-keys')
      .send(chatApiKeyData)
      .expect(201);

    chatApiKeyValue = chatResponse.body.value;

    // Create an API key without CHAT permissions for negative testing
    const noChatApiKeyData = {
      user_id: client.user.id,
      namespace_id: client.namespace.id,
      attrs: {
        root_resource_id: client.namespace.root_resource_id,
        permissions: [
          {
            target: APIKeyPermissionTarget.RESOURCES,
            permissions: [APIKeyPermissionType.READ],
          },
        ],
      },
    };

    const noChatResponse = await client
      .post('/api/v1/api-keys')
      .send(noChatApiKeyData)
      .expect(201);

    noChatApiKeyValue = noChatResponse.body.value;
  });

  afterAll(async () => {
    await client.close();
  });

  it('should get API key info with authenticated API key (GET)', async () => {
    const response = await client
      .request()
      .get('/open/api/v1/api-keys/info')
      .set('Authorization', `Bearer ${client.apiKey.value}`)
      .expect(200);

    expect(response.body).toMatchObject({
      api_key: {
        id: client.apiKey.id,
        user_id: client.user.id,
        namespace_id: client.namespace.id,
        attrs: {
          root_resource_id: client.namespace.root_resource_id,
          permissions: [
            {
              target: 'resources',
              permissions: [
                APIKeyPermissionType.READ,
                APIKeyPermissionType.CREATE,
              ],
            },
          ],
        },
      },
      namespace: {
        id: client.namespace.id,
        name: client.namespace.name,
        root_resource_id: client.namespace.root_resource_id,
      },
      user: {
        id: client.user.id,
        username: client.user.username,
        email: client.user.email,
      },
    });
    expect(response.body.api_key.value).toBeDefined();
    expect(response.body.api_key.created_at).toBeDefined();
    expect(response.body.api_key.updated_at).toBeDefined();
  });
});
