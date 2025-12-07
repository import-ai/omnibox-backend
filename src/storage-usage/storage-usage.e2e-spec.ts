import { HttpStatus } from '@nestjs/common';
import { TestClient } from 'test/test-client';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';

describe('StorageUsageController (e2e)', () => {
  let client: TestClient;
  let secondClient: TestClient;
  let testResourceId: string;

  beforeAll(async () => {
    client = await TestClient.create();
    secondClient = await TestClient.create();

    // Create a test resource
    const response = await client
      .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
      .send({
        name: 'Test Storage Resource',
        namespaceId: client.namespace.id,
        resourceType: ResourceType.FOLDER,
        parentId: client.namespace.root_resource_id,
        content: '',
        tags: [],
        attrs: {},
      })
      .expect(HttpStatus.CREATED);

    testResourceId = response.body.id;
  });

  afterAll(async () => {
    await client.close();
    await secondClient.close();
  });

  describe('GET /api/v1/namespaces/:namespaceId/usage', () => {
    it('should return namespace usage for member', async () => {
      const response = await client
        .get(`/api/v1/namespaces/${client.namespace.id}/usage`)
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('total_bytes');
      expect(response.body).toHaveProperty('breakdown');
      expect(response.body.breakdown).toHaveProperty('files');
      expect(response.body.breakdown).toHaveProperty('attachments');
      expect(response.body.breakdown).toHaveProperty('contents');
    });

    it('should return 403 for non-member', async () => {
      await secondClient
        .get(`/api/v1/namespaces/${client.namespace.id}/usage`)
        .expect(HttpStatus.FORBIDDEN);
    });
  });

  describe('GET /api/v1/namespaces/:namespaceId/resources/:resourceId/usage', () => {
    it('should return resource usage for user with permission', async () => {
      const response = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/usage`,
        )
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('total_bytes');
      expect(response.body).toHaveProperty('breakdown');
    });

    it('should return 403 for user without permission', async () => {
      await secondClient
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/usage`,
        )
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should support recursive query param', async () => {
      const response = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/usage?recursive=true`,
        )
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('total_bytes');
    });
  });
});
