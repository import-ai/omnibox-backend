import { TestClient } from 'test/test-client';
import { APIKeyPermission } from './api-key.entity';

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
        permissions: {
          resources: [APIKeyPermission.READ, APIKeyPermission.CREATE],
        },
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
        permissions: {
          resources: [APIKeyPermission.READ, APIKeyPermission.CREATE],
        },
      },
    });
    expect(body.id).toBeDefined();
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
        permissions: {
          resources: [APIKeyPermission.READ, APIKeyPermission.CREATE],
        },
      },
    });
  });

  it('should update an API key (PUT)', async () => {
    const updateData = {
      attrs: {
        root_resource_id: client.namespace.root_resource_id,
        permissions: { resources: [APIKeyPermission.READ] },
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
        permissions: { resources: [APIKeyPermission.READ] },
      },
    });
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
        permissions: {
          resources: [APIKeyPermission.READ],
        },
      },
    };

    await client.post('/api/v1/api-keys').send(apiKeyData).expect(403);
  });

  it('should return 403 when user tries to create API key with resource they do not have write access to', async () => {
    const apiKeyData = {
      user_id: client.user.id,
      namespace_id: client.namespace.id,
      attrs: {
        root_resource_id: 'non-existent-resource',
        permissions: {
          resources: [APIKeyPermission.READ],
        },
      },
    };

    await client.post('/api/v1/api-keys').send(apiKeyData).expect(403);
  });
});
