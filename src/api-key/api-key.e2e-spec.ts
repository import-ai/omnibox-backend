import { TestClient } from 'test/test-client';
import { APIKeyPermissionTarget, APIKeyPermissionType } from './api-key.entity';

describe('APIKeyController (e2e)', () => {
  let client: TestClient;
  let apiKeyId: string;

  beforeAll(async () => {
    client = await TestClient.create();
  });

  afterAll(async () => {
    await client.close();
  });

  it('should create an API key (POST)', async () => {
    const apiKeyData = {
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
    };

    const response = await client
      .post('/api/v1/api-keys')
      .send(apiKeyData)
      .expect(201);

    const body: Record<string, any> = response.body;

    expect(body).toMatchObject({
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
    });
    expect(body.id).toBeDefined();
    expect(body.value).toBeDefined();
    expect(body.value).toMatch(/^sk-[a-f0-9]{40}$/);
    expect(body.created_at).toBeDefined();
    expect(body.updated_at).toBeDefined();

    apiKeyId = response.body.id;
  });

  it('should get all API keys (GET)', async () => {
    const response = await client
      .get(`/api/v1/api-keys?user_id=${client.user.id}`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThan(0);
    expect(response.body.some((key: any) => key.id === apiKeyId)).toBe(true);
  });

  it('should get all API keys filtered by user_id (GET)', async () => {
    const response = await client
      .get(`/api/v1/api-keys?user_id=${client.user.id}`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(
      response.body.every((key: any) => key.user_id === client.user.id),
    ).toBe(true);
  });

  it('should get all API keys filtered by namespace_id (GET)', async () => {
    const response = await client
      .get(`/api/v1/api-keys?namespace_id=${client.namespace.id}`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(
      response.body.every(
        (key: any) => key.namespace_id === client.namespace.id,
      ),
    ).toBe(true);
  });

  it('should get all API keys filtered by both user_id and namespace_id (GET)', async () => {
    const response = await client
      .get(
        `/api/v1/api-keys?user_id=${client.user.id}&namespace_id=${client.namespace.id}`,
      )
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(
      response.body.every(
        (key: any) =>
          key.user_id === client.user.id &&
          key.namespace_id === client.namespace.id,
      ),
    ).toBe(true);
  });

  it('should get a single API key (GET)', async () => {
    const response = await client
      .get(`/api/v1/api-keys/${apiKeyId}`)
      .expect(200);

    expect(response.body).toMatchObject({
      id: apiKeyId,
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
    });
  });

  it('should update an API key (PUT)', async () => {
    const updateData = {
      attrs: {
        root_resource_id: client.namespace.root_resource_id,
        permissions: [
          {
            target: 'resources',
            permissions: [APIKeyPermissionType.READ],
          },
        ],
      },
    };

    const response = await client
      .put(`/api/v1/api-keys/${apiKeyId}`)
      .send(updateData)
      .expect(200);

    expect(response.body).toMatchObject({
      id: apiKeyId,
      attrs: {
        root_resource_id: client.namespace.root_resource_id,
        permissions: [
          {
            target: 'resources',
            permissions: [APIKeyPermissionType.READ],
          },
        ],
      },
    });
  });

  it('should partially update an API key permissions only (PATCH)', async () => {
    const patchData = {
      permissions: [
        {
          target: 'resources',
          permissions: [APIKeyPermissionType.READ, APIKeyPermissionType.UPDATE],
        },
      ],
    };

    const response = await client
      .patch(`/api/v1/api-keys/${apiKeyId}`)
      .send(patchData)
      .expect(200);

    expect(response.body).toMatchObject({
      id: apiKeyId,
      attrs: {
        root_resource_id: client.namespace.root_resource_id, // Should remain unchanged
        permissions: [
          {
            target: 'resources',
            permissions: [
              APIKeyPermissionType.READ,
              APIKeyPermissionType.UPDATE,
            ],
          },
        ],
      },
    });
  });

  it('should partially update an API key root_resource_id only (PATCH)', async () => {
    const patchData = {
      root_resource_id: client.namespace.root_resource_id,
    };

    const response = await client
      .patch(`/api/v1/api-keys/${apiKeyId}`)
      .send(patchData)
      .expect(200);

    expect(response.body).toMatchObject({
      id: apiKeyId,
      attrs: {
        root_resource_id: client.namespace.root_resource_id,
        permissions: [
          {
            target: 'resources',
            permissions: [
              APIKeyPermissionType.READ,
              APIKeyPermissionType.UPDATE,
            ],
          },
        ], // Should remain unchanged from previous test
      },
    });
  });

  it('should partially update both root_resource_id and permissions (PATCH)', async () => {
    const patchData = {
      root_resource_id: client.namespace.root_resource_id,
      permissions: [
        {
          target: 'resources',
          permissions: [
            APIKeyPermissionType.CREATE,
            APIKeyPermissionType.DELETE,
          ],
        },
      ],
    };

    const response = await client
      .patch(`/api/v1/api-keys/${apiKeyId}`)
      .send(patchData)
      .expect(200);

    expect(response.body).toMatchObject({
      id: apiKeyId,
      attrs: {
        root_resource_id: client.namespace.root_resource_id,
        permissions: [
          {
            target: 'resources',
            permissions: [
              APIKeyPermissionType.CREATE,
              APIKeyPermissionType.DELETE,
            ],
          },
        ],
      },
    });
  });

  it('should return 404 when patching non-existent API key (PATCH)', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000000';
    const patchData = {
      permissions: [
        {
          target: 'resources',
          permissions: [APIKeyPermissionType.READ],
        },
      ],
    };

    await client
      .patch(`/api/v1/api-keys/${nonExistentId}`)
      .send(patchData)
      .expect(404);
  });

  it('should return 404 when patching API key with resource user does not have write access to (PATCH)', async () => {
    const patchData = {
      root_resource_id: 'non-existent-resource',
    };

    await client
      .patch(`/api/v1/api-keys/${apiKeyId}`)
      .send(patchData)
      .expect(404);
  });

  it('should preserve related_app_id during patch operations', async () => {
    const wechatBotCreateResponse = await client.post(
      `/api/v1/namespaces/${client.namespace.id}/applications/wechat_bot`,
    );
    const verifyCode: string = wechatBotCreateResponse.body.attrs.verify_code;
    const wechatBotCallbackResponse = await client
      .post('/internal/api/v1/applications/wechat_bot')
      .send({
        verify_code: verifyCode,
        wechat_user_id: 'wechat-user-123',
        nickname: 'Test WeChat User',
      });
    const apiKey = wechatBotCallbackResponse.body.api_key;
    const patchResponse = await client
      .patch(`/api/v1/api-keys/${apiKey.id}`)
      .send({
        attrs: {
          permissions: [
            {
              target: APIKeyPermissionTarget.RESOURCES,
              permissions: [
                APIKeyPermissionType.READ,
                APIKeyPermissionType.CREATE,
              ],
            },
          ],
          root_resource_id: client.namespace.root_resource_id,
        },
      });
    expect(patchResponse.body.attrs.related_app_id).toBe(
      apiKey.attrs.related_app_id,
    );
  });

  it('should delete an API key (DELETE)', async () => {
    await client.delete(`/api/v1/api-keys/${apiKeyId}`).expect(200);

    await client.get(`/api/v1/api-keys/${apiKeyId}`).expect(404);
  });

  it('should return 404 for non-existent API key (GET)', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000000';
    await client.get(`/api/v1/api-keys/${nonExistentId}`).expect(404);
  });

  it('should return 403 when user tries to create API key for namespace they are not a member of', async () => {
    const apiKeyData = {
      user_id: client.user.id,
      namespace_id: 'non-existent-namespace',
      attrs: {
        root_resource_id: client.namespace.root_resource_id,
        permissions: [
          {
            target: 'resources',
            permissions: [APIKeyPermissionType.READ],
          },
        ],
      },
    };

    await client.post('/api/v1/api-keys').send(apiKeyData).expect(403);
  });

  it('should return 404 when user tries to create API key with resource they do not have write access to', async () => {
    const apiKeyData = {
      user_id: client.user.id,
      namespace_id: client.namespace.id,
      attrs: {
        root_resource_id: 'non-existent-resource',
        permissions: [
          {
            target: 'resources',
            permissions: [APIKeyPermissionType.READ],
          },
        ],
      },
    };

    await client.post('/api/v1/api-keys').send(apiKeyData).expect(404);
  });
});
