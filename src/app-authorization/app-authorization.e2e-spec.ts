import { TestClient } from 'test/test-client';
import { HttpStatus } from '@nestjs/common';

describe('AppAuthorizationController (e2e)', () => {
  let client: TestClient;
  let secondClient: TestClient;
  let authorizationId: string;

  beforeAll(async () => {
    client = await TestClient.create();
    secondClient = await TestClient.create();
  });

  afterAll(async () => {
    await client.close();
    await secondClient.close();
  });

  describe('Create App Authorization (POST)', () => {
    it('should create a regular app authorization', async () => {
      const authData = {
        user_id: client.user.id,
        app_id: 'regular_app',
        attrs: {
          custom_field: 'custom_value',
        },
      };

      const response = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/apps/authorizations`)
        .send(authData)
        .expect(201);

      expect(response.body).toMatchObject({
        namespace_id: client.namespace.id,
        user_id: client.user.id,
        app_id: 'regular_app',
        attrs: {
          custom_field: 'custom_value',
        },
      });
      expect(response.body.id).toBeDefined();
      expect(response.body.created_at).toBeDefined();
      expect(response.body.updated_at).toBeDefined();
      expect(response.body.api_key_id).toBeNull();

      authorizationId = response.body.id;
      expect(authorizationId).toBeDefined();
    });

    it('should create a wechat_bot authorization with verify code', async () => {
      const authData = {
        user_id: client.user.id,
        app_id: 'wechat_bot',
        attrs: {
          additional_field: 'value',
        },
      };

      const response = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/apps/authorizations`)
        .send(authData)
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

    it('should create multiple wechat_bot authorizations with unique verify codes', async () => {
      const tempClient1 = await TestClient.create();
      const tempClient2 = await TestClient.create();

      const authData1 = {
        user_id: tempClient1.user.id,
        app_id: 'wechat_bot',
      };

      const authData2 = {
        user_id: tempClient2.user.id,
        app_id: 'wechat_bot',
      };

      const [response1, response2] = await Promise.all([
        tempClient1
          .post(
            `/api/v1/namespaces/${tempClient1.namespace.id}/apps/authorizations`,
          )
          .send(authData1)
          .expect(201),
        tempClient2
          .post(
            `/api/v1/namespaces/${tempClient2.namespace.id}/apps/authorizations`,
          )
          .send(authData2)
          .expect(201),
      ]);

      expect(response1.body.attrs.verify_code).toMatch(/^\d{6}$/);
      expect(response2.body.attrs.verify_code).toMatch(/^\d{6}$/);
      expect(response1.body.attrs.verify_code).not.toBe(
        response2.body.attrs.verify_code,
      );

      await tempClient1.close();
      await tempClient2.close();
    });

    it('should create authorization with API key reference', async () => {
      // First create an API key
      const apiKeyData = {
        user_id: client.user.id,
        namespace_id: client.namespace.id,
        attrs: {
          root_resource_id: client.namespace.root_resource_id,
          permissions: [
            {
              target: 'resources',
              permissions: ['READ'],
            },
          ],
        },
      };

      const apiKeyResponse = await client
        .post('/api/v1/api-keys')
        .send(apiKeyData)
        .expect(201);

      const authData = {
        user_id: client.user.id,
        app_id: 'api_app',
        api_key_id: apiKeyResponse.body.id,
        attrs: {
          description: 'Authorization with API key',
        },
      };

      const response = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/apps/authorizations`)
        .send(authData)
        .expect(201);

      expect(response.body).toMatchObject({
        namespace_id: client.namespace.id,
        user_id: client.user.id,
        app_id: 'api_app',
        api_key_id: apiKeyResponse.body.id,
        attrs: {
          description: 'Authorization with API key',
        },
      });
    });

    it('should fail to create authorization without required fields', async () => {
      const authData = {
        app_id: 'incomplete_app',
        // Missing user_id
      };

      await client
        .post(`/api/v1/namespaces/${client.namespace.id}/apps/authorizations`)
        .send(authData)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should fail to create authorization for namespace user is not member of', async () => {
      const authData = {
        user_id: client.user.id,
        app_id: 'unauthorized_app',
      };

      await client
        .post(`/api/v1/namespaces/non-existent-namespace/apps/authorizations`)
        .send(authData)
        .expect(HttpStatus.FORBIDDEN);
    });
  });

  describe('Get App Authorizations (GET)', () => {
    let testAuthId: string;

    beforeAll(async () => {
      // Create a test authorization
      const authData = {
        user_id: client.user.id,
        app_id: 'test_get_app',
        attrs: { test: 'data' },
      };

      const response = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/apps/authorizations`)
        .send(authData)
        .expect(201);

      testAuthId = response.body.id;
    });

    it('should get all authorizations in namespace', async () => {
      const response = await client
        .get(`/api/v1/namespaces/${client.namespace.id}/apps/authorizations`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body.some((auth: any) => auth.id === testAuthId)).toBe(
        true,
      );
    });

    it('should filter authorizations by app_id', async () => {
      const response = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/apps/authorizations?app_id=test_get_app`,
        )
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(
        response.body.every((auth: any) => auth.app_id === 'test_get_app'),
      ).toBe(true);
      expect(response.body.some((auth: any) => auth.id === testAuthId)).toBe(
        true,
      );
    });

    it('should filter authorizations by user_id', async () => {
      const response = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/apps/authorizations?user_id=${client.user.id}`,
        )
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(
        response.body.every((auth: any) => auth.user_id === client.user.id),
      ).toBe(true);
    });

    it('should get single authorization by id', async () => {
      const response = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/apps/authorizations/${testAuthId}`,
        )
        .expect(200);

      expect(response.body).toMatchObject({
        id: testAuthId,
        namespace_id: client.namespace.id,
        user_id: client.user.id,
        app_id: 'test_get_app',
        attrs: { test: 'data' },
      });
    });

    it('should return 404 for non-existent authorization', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/apps/authorizations/${nonExistentId}`,
        )
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should fail to access authorization from different namespace', async () => {
      await secondClient
        .get(
          `/api/v1/namespaces/${secondClient.namespace.id}/apps/authorizations/${testAuthId}`,
        )
        .expect(HttpStatus.FORBIDDEN);
    });
  });

  describe('Update App Authorization (PUT)', () => {
    let updateTestAuthId: string;

    beforeAll(async () => {
      // Create a test authorization for updating
      const authData = {
        user_id: client.user.id,
        app_id: 'update_test_app',
        attrs: { original: 'value' },
      };

      const response = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/apps/authorizations`)
        .send(authData)
        .expect(201);

      updateTestAuthId = response.body.id;
    });

    it('should update authorization app_id', async () => {
      const updateData = {
        app_id: 'updated_app',
      };

      const response = await client
        .put(
          `/api/v1/namespaces/${client.namespace.id}/apps/authorizations/${updateTestAuthId}`,
        )
        .send(updateData)
        .expect(200);

      expect(response.body).toMatchObject({
        id: updateTestAuthId,
        app_id: 'updated_app',
        attrs: { original: 'value' },
      });
    });

    it('should update authorization attrs', async () => {
      const updateData = {
        attrs: {
          updated: 'attributes',
          new_field: 'new_value',
        },
      };

      const response = await client
        .put(
          `/api/v1/namespaces/${client.namespace.id}/apps/authorizations/${updateTestAuthId}`,
        )
        .send(updateData)
        .expect(200);

      expect(response.body).toMatchObject({
        id: updateTestAuthId,
        attrs: {
          updated: 'attributes',
          new_field: 'new_value',
        },
      });
    });

    it('should update authorization api_key_id', async () => {
      // Create an API key first
      const apiKeyData = {
        user_id: client.user.id,
        namespace_id: client.namespace.id,
        attrs: {
          root_resource_id: client.namespace.root_resource_id,
          permissions: [
            {
              target: 'resources',
              permissions: ['READ'],
            },
          ],
        },
      };

      const apiKeyResponse = await client
        .post('/api/v1/api-keys')
        .send(apiKeyData)
        .expect(201);

      const updateData = {
        api_key_id: apiKeyResponse.body.id,
      };

      const response = await client
        .put(
          `/api/v1/namespaces/${client.namespace.id}/apps/authorizations/${updateTestAuthId}`,
        )
        .send(updateData)
        .expect(200);

      expect(response.body).toMatchObject({
        id: updateTestAuthId,
        api_key_id: apiKeyResponse.body.id,
      });
    });

    it('should return 404 when updating non-existent authorization', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      const updateData = {
        app_id: 'new_app',
      };

      await client
        .put(
          `/api/v1/namespaces/${client.namespace.id}/apps/authorizations/${nonExistentId}`,
        )
        .send(updateData)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should fail to update authorization from different namespace', async () => {
      const updateData = {
        app_id: 'unauthorized_update',
      };

      await secondClient
        .put(
          `/api/v1/namespaces/${secondClient.namespace.id}/apps/authorizations/${updateTestAuthId}`,
        )
        .send(updateData)
        .expect(HttpStatus.FORBIDDEN);
    });
  });

  describe('Delete App Authorization (DELETE)', () => {
    let deleteTestAuthId: string;

    beforeAll(async () => {
      // Create a test authorization for deletion
      const authData = {
        user_id: client.user.id,
        app_id: 'delete_test_app',
        attrs: { to_be: 'deleted' },
      };

      const response = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/apps/authorizations`)
        .send(authData)
        .expect(201);

      deleteTestAuthId = response.body.id;
    });

    it('should delete an authorization', async () => {
      await client
        .delete(
          `/api/v1/namespaces/${client.namespace.id}/apps/authorizations/${deleteTestAuthId}`,
        )
        .expect(200);

      // Verify it's deleted
      await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/apps/authorizations/${deleteTestAuthId}`,
        )
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should return 404 when deleting non-existent authorization', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      await client
        .delete(
          `/api/v1/namespaces/${client.namespace.id}/apps/authorizations/${nonExistentId}`,
        )
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should fail to delete authorization from different namespace', async () => {
      // Create another authorization to test cross-namespace deletion
      const authData = {
        user_id: client.user.id,
        app_id: 'cross_namespace_test',
      };

      const createResponse = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/apps/authorizations`)
        .send(authData)
        .expect(201);

      await secondClient
        .delete(
          `/api/v1/namespaces/${secondClient.namespace.id}/apps/authorizations/${createResponse.body.id}`,
        )
        .expect(HttpStatus.FORBIDDEN);
    });
  });

  describe('WeChat Bot Verify Code Generation', () => {
    it('should generate unique 6-digit verify codes for multiple wechat_bot authorizations', async () => {
      const verifyCodes: string[] = [];

      // Create multiple wechat_bot authorizations with different app_ids to avoid constraint violation
      for (let i = 0; i < 3; i++) {
        const authData = {
          user_id: client.user.id,
          app_id: 'wechat_bot',
          attrs: {
            test_index: i,
          },
        };

        // Use different user_id to avoid unique constraint
        const tempClient = await TestClient.create();

        const response = await tempClient
          .post(
            `/api/v1/namespaces/${tempClient.namespace.id}/apps/authorizations`,
          )
          .send({
            ...authData,
            user_id: tempClient.user.id,
          })
          .expect(201);

        expect(response.body.attrs.verify_code).toMatch(/^\d{6}$/);
        verifyCodes.push(response.body.attrs.verify_code);

        await tempClient.close();
      }

      // Verify all codes are unique
      const uniqueCodes = [...new Set(verifyCodes)];
      expect(uniqueCodes.length).toBe(verifyCodes.length);
    });

    it('should preserve existing attrs when adding verify code to wechat_bot', async () => {
      const tempClient = await TestClient.create();

      const authData = {
        user_id: tempClient.user.id,
        app_id: 'wechat_bot',
        attrs: {
          existing_field: 'preserved_value',
          nested_object: {
            inner_field: 'inner_value',
          },
        },
      };

      const response = await tempClient
        .post(
          `/api/v1/namespaces/${tempClient.namespace.id}/apps/authorizations`,
        )
        .send(authData)
        .expect(201);

      expect(response.body.attrs).toMatchObject({
        existing_field: 'preserved_value',
        nested_object: {
          inner_field: 'inner_value',
        },
        verify_code: expect.stringMatching(/^\d{6}$/),
      });

      await tempClient.close();
    });

    it('should not add verify code for non-wechat_bot apps', async () => {
      const authData = {
        user_id: client.user.id,
        app_id: 'regular_app_test',
        attrs: {
          custom_field: 'value',
        },
      };

      const response = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/apps/authorizations`)
        .send(authData)
        .expect(201);

      expect(response.body.attrs).toEqual({
        custom_field: 'value',
      });
      expect(response.body.attrs.verify_code).toBeUndefined();
    });

    it('should handle wechat_bot authorization with empty attrs', async () => {
      const tempClient = await TestClient.create();

      const authData = {
        user_id: tempClient.user.id,
        app_id: 'wechat_bot',
      };

      const response = await tempClient
        .post(
          `/api/v1/namespaces/${tempClient.namespace.id}/apps/authorizations`,
        )
        .send(authData)
        .expect(201);

      expect(response.body.attrs).toEqual({
        verify_code: expect.stringMatching(/^\d{6}$/),
      });

      await tempClient.close();
    });
  });

  describe('Authorization Constraints', () => {
    it('should enforce unique constraint on (userId, namespaceId, appId)', async () => {
      const authData = {
        user_id: client.user.id,
        app_id: 'unique_constraint_test',
        attrs: { first: 'attempt' },
      };

      // First creation should succeed
      await client
        .post(`/api/v1/namespaces/${client.namespace.id}/apps/authorizations`)
        .send(authData)
        .expect(201);

      // Second creation with same combination should fail with 500 (database constraint error)
      await client
        .post(`/api/v1/namespaces/${client.namespace.id}/apps/authorizations`)
        .send({
          ...authData,
          attrs: { second: 'attempt' },
        })
        .expect(HttpStatus.INTERNAL_SERVER_ERROR);
    });

    it('should allow same app_id for different users', async () => {
      const authData1 = {
        user_id: client.user.id,
        app_id: 'multi_user_app',
        attrs: { user: 'first' },
      };

      const authData2 = {
        user_id: secondClient.user.id,
        app_id: 'multi_user_app',
        attrs: { user: 'second' },
      };

      const [response1, response2] = await Promise.all([
        client
          .post(`/api/v1/namespaces/${client.namespace.id}/apps/authorizations`)
          .send(authData1)
          .expect(201),
        secondClient
          .post(
            `/api/v1/namespaces/${secondClient.namespace.id}/apps/authorizations`,
          )
          .send(authData2)
          .expect(201),
      ]);

      expect(response1.body.app_id).toBe('multi_user_app');
      expect(response2.body.app_id).toBe('multi_user_app');
      expect(response1.body.user_id).not.toBe(response2.body.user_id);
    });
  });
});
