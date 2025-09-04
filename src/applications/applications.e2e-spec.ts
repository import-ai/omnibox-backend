import { TestClient } from 'test/test-client';
import { HttpStatus } from '@nestjs/common';
import { WechatBot } from 'omniboxd/applications/apps/wechat-bot';

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

      expect(getAllResponse.body).toEqual([{ app_id: WechatBot.appId }]);

      const appData = {
        user_id: client.user.id,
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

    it('should fail to create application without required fields', async () => {
      const appData = {
        // Missing user_id
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
});
