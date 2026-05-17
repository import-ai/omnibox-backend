import { TestClient } from 'test/test-client';
import {
  APIKeyPermissionTarget,
  APIKeyPermissionType,
} from 'omniboxd/api-key/api-key.entity';
import { uploadLanguageDatasets } from 'omniboxd/namespace-resources/file-resources.e2e-spec';
import { ResourceDto } from 'omniboxd/namespace-resources/dto/resource.dto';

describe('OpenResourcesController (e2e)', () => {
  let client: TestClient;
  let apiKeyValue: string;
  let readOnlyApiKeyValue: string;
  let lifecycleApiKeyValue: string;

  beforeAll(async () => {
    client = await TestClient.create();

    // Create an API key with CREATE permissions for testing
    const apiKeyData = {
      user_id: client.user.id,
      namespace_id: client.namespace.id,
      attrs: {
        root_resource_id: client.namespace.root_resource_id,
        permissions: [
          {
            target: APIKeyPermissionTarget.RESOURCES,
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

    // Create a read-only API key for permission testing
    const readOnlyApiKeyData = {
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

    const readOnlyResponse = await client
      .post('/api/v1/api-keys')
      .send(readOnlyApiKeyData)
      .expect(201);

    readOnlyApiKeyValue = readOnlyResponse.body.value;

    const lifecycleApiKeyData = {
      user_id: client.user.id,
      namespace_id: client.namespace.id,
      attrs: {
        root_resource_id: client.namespace.root_resource_id,
        permissions: [
          {
            target: APIKeyPermissionTarget.RESOURCES,
            permissions: [
              APIKeyPermissionType.CREATE,
              APIKeyPermissionType.READ,
              APIKeyPermissionType.UPDATE,
              APIKeyPermissionType.DELETE,
            ],
          },
        ],
      },
    };

    const lifecycleResponse = await client
      .post('/api/v1/api-keys')
      .send(lifecycleApiKeyData)
      .expect(201);

    lifecycleApiKeyValue = lifecycleResponse.body.value;
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

    it('create_resource_with_tags', async () => {
      const resourceData = {
        content: 'Minimal content for the resource #tag1 #tag2',
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

      const resourceId = response.body.id;

      const resourceResponse = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/${resourceId}`,
        )
        .send()
        .expect(200);

      const resource: ResourceDto = resourceResponse.body;
      expect(resource.tags).toHaveLength(2);
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

    it('should reject resource creation with API key lacking CREATE permission', async () => {
      const resourceData = {
        name: 'Test Document',
        content: 'This is a test document content',
      };

      await client
        .request()
        .post('/open/api/v1/resources')
        .set('Authorization', `Bearer ${readOnlyApiKeyValue}`)
        .send(resourceData)
        .expect(403);
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

  describe('resource lifecycle open APIs', () => {
    it('should list and get resources with READ permission', async () => {
      const resourceResponse = await client
        .request()
        .post('/open/api/v1/resources')
        .set('Authorization', `Bearer ${apiKeyValue}`)
        .send({
          name: 'Open Lifecycle Read',
          content: 'Content for open lifecycle read',
        })
        .expect(201);

      const resourceId = resourceResponse.body.id;

      const listResponse = await client
        .request()
        .get('/open/api/v1/resources')
        .set('Authorization', `Bearer ${readOnlyApiKeyValue}`)
        .expect(200);

      expect(Array.isArray(listResponse.body)).toBe(true);
      expect(
        listResponse.body.some((item: any) => item.id === resourceId),
      ).toBe(true);

      const getResponse = await client
        .request()
        .get(`/open/api/v1/resources/${resourceId}`)
        .set('Authorization', `Bearer ${readOnlyApiKeyValue}`)
        .expect(200);

      expect(getResponse.body).toMatchObject({
        id: resourceId,
        name: 'Open Lifecycle Read',
        content: 'Content for open lifecycle read',
      });
    });

    it('should update and delete resources with lifecycle permissions', async () => {
      const resourceResponse = await client
        .request()
        .post('/open/api/v1/resources')
        .set('Authorization', `Bearer ${lifecycleApiKeyValue}`)
        .send({
          name: 'Open Lifecycle Update',
          content: 'Initial open lifecycle content',
        })
        .expect(201);

      const resourceId = resourceResponse.body.id;

      const updateResponse = await client
        .request()
        .patch(`/open/api/v1/resources/${resourceId}`)
        .set('Authorization', `Bearer ${lifecycleApiKeyValue}`)
        .send({
          name: 'Open Lifecycle Updated',
          content: 'Updated open lifecycle content',
        })
        .expect(200);

      expect(updateResponse.body).toMatchObject({
        id: resourceId,
        name: 'Open Lifecycle Updated',
        content: 'Updated open lifecycle content',
      });

      await client
        .request()
        .delete(`/open/api/v1/resources/${resourceId}`)
        .set('Authorization', `Bearer ${lifecycleApiKeyValue}`)
        .expect(200);

      await client
        .request()
        .get(`/open/api/v1/resources/${resourceId}`)
        .set('Authorization', `Bearer ${readOnlyApiKeyValue}`)
        .expect(404);
    });

    it('should reject update when API key lacks UPDATE permission', async () => {
      const resourceResponse = await client
        .request()
        .post('/open/api/v1/resources')
        .set('Authorization', `Bearer ${apiKeyValue}`)
        .send({
          name: 'Open Lifecycle Permission',
          content: 'Permission test content',
        })
        .expect(201);

      await client
        .request()
        .patch(`/open/api/v1/resources/${resourceResponse.body.id}`)
        .set('Authorization', `Bearer ${readOnlyApiKeyValue}`)
        .send({ name: 'Should not update' })
        .expect(403);
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

  it('should reject file upload with API key lacking CREATE permission', async () => {
    const testFile = Buffer.from('test file content');

    await client
      .post('/open/api/v1/resources/upload')
      .set('Authorization', `Bearer ${readOnlyApiKeyValue}`)
      .attach('file', testFile, 'test.txt')
      .expect(403);
  });
});
