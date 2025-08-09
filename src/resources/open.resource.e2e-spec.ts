import { TestClient } from 'test/test-client';
import { APIKeyPermissionType } from 'omniboxd/api-key/api-key.entity';
import { uploadLanguageDatasets } from 'omniboxd/resources/file-resources.e2e-spec';

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

    apiKeyValue = response.body.value;
  });

  afterAll(async () => {
    await client.close();
  });

  describe('POST /open/api/v1/resources', () => {
    it('should create a new resource with valid data', async () => {
      const resourceData = {
        name: 'Test Document',
        content: 'This is a test document content',
        tags: ['test', 'document'],
        attrs: { custom: 'attribute' },
      };

      const response = await client
        .request()
        .post('/open/api/v1/resources')
        .set('Authorization', `Bearer ${apiKeyValue}`)
        .send(resourceData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(typeof response.body.id).toBe('string');
      expect(response.body.name).toBe(resourceData.name);
    });

    it('should create a resource with minimal required data', async () => {
      const resourceData = {
        content: 'Minimal content for the resource',
      };

      const response = await client
        .request()
        .post('/open/api/v1/resources')
        .set('Authorization', `Bearer ${apiKeyValue}`)
        .send(resourceData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(typeof response.body.id).toBe('string');
      expect(response.body).toHaveProperty('name');
    });

    it('should create resources with different content types', async () => {
      const testCases = [
        {
          name: 'Text Content',
          content: 'This is plain text content',
        },
        {
          name: 'JSON Content',
          content: JSON.stringify({ key: 'value', number: 42 }),
        },
        {
          name: 'Code Content',
          content: 'function hello() { return "world"; }',
        },
      ];

      for (const resourceData of testCases) {
        const response = await client
          .request()
          .post('/open/api/v1/resources')
          .set('Authorization', `Bearer ${apiKeyValue}`)
          .send(resourceData)
          .expect(201);

        expect(response.body).toHaveProperty('id');
        expect(typeof response.body.id).toBe('string');
        expect(response.body.name).toBe(resourceData.name);
      }
    });

    it('should reject resource creation without authorization header', async () => {
      const resourceData = {
        name: 'Test Document',
        content: 'This is a test document content',
      };

      await client
        .request()
        .post('/open/api/v1/resources')
        .send(resourceData)
        .expect(401);
    });

    it('should reject resource creation with invalid API key format', async () => {
      const resourceData = {
        name: 'Test Document',
        content: 'This is a test document content',
      };

      await client
        .request()
        .post('/open/api/v1/resources')
        .set('Authorization', 'Bearer invalid-key-format')
        .send(resourceData)
        .expect(401);
    });

    it('should reject resource creation with non-existent API key', async () => {
      const resourceData = {
        name: 'Test Document',
        content: 'This is a test document content',
      };

      await client
        .request()
        .post('/open/api/v1/resources')
        .set('Authorization', 'Bearer sk-nonexistentkey1234567890123456789012')
        .send(resourceData)
        .expect(401);
    });

    it('should reject resource creation without required content', async () => {
      const resourceData = {
        name: 'Test Document',
        tags: ['test'],
      };

      await client
        .request()
        .post('/open/api/v1/resources')
        .set('Authorization', `Bearer ${apiKeyValue}`)
        .send(resourceData)
        .expect(400);
    });

    it('should reject resource creation with empty content', async () => {
      const resourceData = {
        name: 'Test Document',
        content: '',
      };

      await client
        .request()
        .post('/open/api/v1/resources')
        .set('Authorization', `Bearer ${apiKeyValue}`)
        .send(resourceData)
        .expect(400);
    });

    it('should reject resource creation with null content', async () => {
      const resourceData = {
        name: 'Test Document',
        content: null,
      };

      await client
        .request()
        .post('/open/api/v1/resources')
        .set('Authorization', `Bearer ${apiKeyValue}`)
        .send(resourceData)
        .expect(400);
    });
  });

  test.each(uploadLanguageDatasets)(
    'upload file via api: $filename',
    async ({ filename, content }) => {
      const response = await client
        .post('/open/api/v1/resources/upload')
        .set('Authorization', `Bearer ${apiKeyValue}`)
        .attach('file', Buffer.from(content), filename)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(typeof response.body.id).toBe('string');
      expect(response.body.name).toBe(filename);
    },
  );

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
