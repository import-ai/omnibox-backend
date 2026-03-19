import { TestClient } from 'test/test-client';
import { HttpStatus } from '@nestjs/common';
import { WechatBot } from 'omniboxd/applications/apps/wechat-bot';
import { QQBot } from 'omniboxd/applications/apps/qq-bot';

describe('ApplicationsController (e2e)', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = await TestClient.create();
  });

  afterAll(async () => {
    await client.close();
  });

  describe('Create Application (POST)', () => {
    it('should create a wechat_bot application with verify code', async () => {
      const getAllResponse = await client
        .get(`/api/v1/namespaces/${client.namespace.id}/applications`)
        .expect(200);

      expect(getAllResponse.body).toEqual(
        expect.arrayContaining([
          { app_id: WechatBot.appId },
          { app_id: QQBot.appId },
        ]),
      );
      expect(getAllResponse.body).toHaveLength(2);

      const appData = {
        attrs: {
          additional_field: 'value',
        },
      };

      const response = await client
        .post(
          `/api/v1/namespaces/${client.namespace.id}/applications/wechat_bot`,
        )
        .send(appData)
        .expect(201);

      expect(response.body).toMatchObject({
        namespace_id: client.namespace.id,
        user_id: client.user.id,
        app_id: 'wechat_bot',
        attrs: {
          additional_field: 'value',
          verify_code: expect.any(String),
        },
      });
      expect(response.body.attrs.verify_code).toMatch(/^\d{6}$/);
      expect(response.body.id).toBeDefined();
    });

    it('should fail to create application for non-existent app', async () => {
      const appData = {
        user_id: client.user.id,
        attrs: {
          test: 'data',
        },
      };

      await client
        .post(
          `/api/v1/namespaces/${client.namespace.id}/applications/non_existent_app`,
        )
        .send(appData)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should fail to create application with invalid api_key_id', async () => {
      const appData = {
        api_key_id: 'invalid-uuid-format',
        attrs: {
          test: 'data',
        },
      };

      await client
        .post(
          `/api/v1/namespaces/${client.namespace.id}/applications/wechat_bot`,
        )
        .send(appData)
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('FindAll Applications with Query Parameters (GET)', () => {
    it('should return all applications when no query parameters are provided', async () => {
      // Get initial applications (may include ones from previous tests)
      const initialResponse = await client
        .get(`/api/v1/namespaces/${client.namespace.id}/applications`)
        .expect(200);

      // Should always have the registered apps available
      expect(initialResponse.body).toHaveLength(2);
      const appIds = initialResponse.body.map(
        (app: { app_id: string }) => app.app_id,
      );
      expect(appIds).toContain(WechatBot.appId);
      expect(appIds).toContain(QQBot.appId);

      // The test passes if we can retrieve applications without query parameters
      // The specific content depends on test execution order
    });

    it('should filter applications by api_key_id when provided', async () => {
      // Check current state
      const currentResponse = await client
        .get(`/api/v1/namespaces/${client.namespace.id}/applications`)
        .expect(200);

      if (currentResponse.body.length > 0 && currentResponse.body[0].id) {
        const existingApp = currentResponse.body[0];
        // Delete existing application first
        await client
          .delete(
            `/api/v1/namespaces/${client.namespace.id}/applications/${existingApp.id}`,
          )
          .expect(200);
      }

      // Create application with API key
      const appData = {
        api_key_id: client.apiKey.id,
        attrs: {
          test_field: 'test_value',
        },
      };

      const createResponse = await client
        .post(
          `/api/v1/namespaces/${client.namespace.id}/applications/wechat_bot`,
        )
        .send(appData)
        .expect(201);

      // Filter by the API key
      const getFilteredResponse = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/applications?api_key_id=${client.apiKey.id}`,
        )
        .expect(200);

      expect(getFilteredResponse.body).toHaveLength(1);
      expect(getFilteredResponse.body[0].api_key_id).toBe(client.apiKey.id);
      expect(getFilteredResponse.body[0].attrs.test_field).toBe('test_value');

      // Clean up
      await client
        .delete(
          `/api/v1/namespaces/${client.namespace.id}/applications/${createResponse.body.id}`,
        )
        .expect(200);
    });

    it('should return empty array when filtering by non-existent api_key_id', async () => {
      // Filter by non-existent API key (valid UUID format)
      // This should return empty array regardless of existing applications
      const nonExistentApiKeyId = '550e8400-e29b-41d4-a716-446655440000';
      const getResponse = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/applications?api_key_id=${nonExistentApiKeyId}`,
        )
        .expect(200);

      expect(getResponse.body).toEqual([]);
    });

    it('should validate api_key_id format', async () => {
      // Test with invalid UUID format
      await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/applications?api_key_id=invalid-uuid`,
        )
        .expect(HttpStatus.BAD_REQUEST);
    });
  });
});
