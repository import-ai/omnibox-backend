import { TestClient } from 'test/test-client';
import { APIKeyPermissionType } from './api-key.entity';

describe('OpenAPIKeyController (e2e)', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = await TestClient.create();
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
