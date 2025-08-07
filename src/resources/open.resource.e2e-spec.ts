import { TestClient } from 'test/test-client';
import { APIKeyPermission } from 'omniboxd/api-key/api-key.entity';

describe('OpenResourcesController (e2e)', () => {
  let client: TestClient;
  let apiKeyValue: string;

  beforeAll(async () => {
    client = await TestClient.create();

    // Create an API key for testing
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

    apiKeyValue = response.body.value;
  });

  afterAll(async () => {
    await client.close();
  });

  it('should allow file upload with valid API key', async () => {
    // Create a test file to upload
    const testFile = Buffer.from('test file content');

    const response = await client
      .post('/open/api/v1/resources/upload')
      .set('Authorization', `Bearer ${apiKeyValue}`)
      .attach('file', testFile, 'test.txt')
      .expect(201);

    expect(response.body).toHaveProperty('id');
    expect(typeof response.body.id).toBe('string');
  });

  it('should reject file upload without authorization header', async () => {
    const testFile = Buffer.from('test file content');

    await client
      .post('/open/api/v1/resources/upload')
      .attach('file', testFile, 'test.txt')
      .expect(401);
  });

  it('should reject file upload with invalid API key format', async () => {
    const testFile = Buffer.from('test file content');

    await client
      .post('/open/api/v1/resources/upload')
      .set('Authorization', 'Bearer invalid-key-format')
      .attach('file', testFile, 'test.txt')
      .expect(401);
  });

  it('should reject file upload with non-existent API key', async () => {
    const testFile = Buffer.from('test file content');

    await client
      .post('/open/api/v1/resources/upload')
      .set('Authorization', 'Bearer sk-nonexistentkey1234567890123456789012')
      .attach('file', testFile, 'test.txt')
      .expect(401);
  });
});
