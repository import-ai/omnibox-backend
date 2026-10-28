import { HttpStatus } from '@nestjs/common';
import { QQBot } from 'omniboxd/applications/apps/qq-bot';
import { TelegramBot } from 'omniboxd/applications/apps/telegram-bot';
import { WechatBot } from 'omniboxd/applications/apps/wechat-bot';
import { WechatClaw } from 'omniboxd/applications/apps/wechat-claw';
import { WechatOaBot } from 'omniboxd/applications/apps/wechat-oa-bot';
import { TestClient } from 'test/test-client';

describe('ApplicationsController (e2e)', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = await TestClient.create();
  });

  afterAll(async () => {
    await client.close();
  });

  describe('Create Application (POST)', () => {
    it('should ignore client-supplied binding fields when creating an application', async () => {
      const getAllResponse = await client
        .get(`/api/v1/namespaces/${client.namespace.id}/applications`)
        .expect(200);

      expect(getAllResponse.body).toEqual(
        expect.arrayContaining([
          { app_id: WechatBot.appId },
          { app_id: QQBot.appId },
          { app_id: WechatClaw.appId },
          { app_id: WechatOaBot.appId },
          { app_id: TelegramBot.appId },
        ]),
      );
      expect(getAllResponse.body).toHaveLength(5);

      // A binding is only completed by the bot's verified callback. Client
      // fields must not set the bound openid or the binding-completed marker.
      const appData = {
        api_key_id: client.apiKey.id,
        attrs: {
          primary_key: 'victim-openid',
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
        api_key_id: null,
        attrs: {
          key: expect.any(String),
        },
      });
      expect(response.body.attrs.primary_key).toBeUndefined();
      expect(response.body.attrs.additional_field).toBeUndefined();
      expect(response.body.attrs.key).toMatch(/^\d{6}$/);
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
  });

  describe('FindAll Applications with Query Parameters (GET)', () => {
    it('should return all applications when no query parameters are provided', async () => {
      // Get initial applications (may include ones from previous tests)
      const initialResponse = await client
        .get(`/api/v1/namespaces/${client.namespace.id}/applications`)
        .expect(200);

      // Should always have the registered apps available
      expect(initialResponse.body).toHaveLength(5);
      const appIds = initialResponse.body.map(
        (app: { app_id: string }) => app.app_id,
      );
      expect(appIds).toContain(WechatBot.appId);
      expect(appIds).toContain(QQBot.appId);
      expect(appIds).toContain(WechatClaw.appId);
      expect(appIds).toContain(WechatOaBot.appId);
      expect(appIds).toContain(TelegramBot.appId);

      // The test passes if we can retrieve applications without query parameters
      // The specific content depends on test execution order
    });

    it('should filter applications by api_key_id when provided', async () => {
      // Clear applications left by earlier tests.
      const currentResponse = await client
        .get(`/api/v1/namespaces/${client.namespace.id}/applications`)
        .expect(200);
      for (const existingApp of currentResponse.body) {
        if (existingApp.id) {
          await client
            .delete(
              `/api/v1/namespaces/${client.namespace.id}/applications/${existingApp.id}`,
            )
            .expect(200);
        }
      }

      const createResponse = await client
        .post(
          `/api/v1/namespaces/${client.namespace.id}/applications/wechat_bot`,
        )
        .expect(201);
      const callbackResponse = await client
        .post('/internal/api/v1/applications/wechat_bot/callback')
        .send({ key: createResponse.body.attrs.key })
        .expect(201);
      const apiKeyId = callbackResponse.body.api_key.id;

      const getFilteredResponse = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/applications?api_key_id=${apiKeyId}`,
        )
        .expect(200);

      expect(getFilteredResponse.body).toHaveLength(1);
      expect(getFilteredResponse.body[0].id).toBe(createResponse.body.id);
      expect(getFilteredResponse.body[0].api_key_id).toBe(apiKeyId);

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
