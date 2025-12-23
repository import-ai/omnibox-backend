import { TestClient } from 'test/test-client';
import { HttpStatus } from '@nestjs/common';

describe('UserController (e2e)', () => {
  let client: TestClient;
  let secondClient: TestClient;

  beforeAll(async () => {
    client = await TestClient.create();
    secondClient = await TestClient.create();
  });

  afterAll(async () => {
    await client.close();
    await secondClient.close();
  });

  describe('GET /api/v1/user', () => {
    it('should get paginated list of users with authentication', async () => {
      const response = await client
        .get('/api/v1/user?start=1&limit=10')
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('start', 1);
      expect(response.body).toHaveProperty('limit', 10);
      expect(response.body).toHaveProperty('list');
      expect(response.body).toHaveProperty('total');
      expect(Array.isArray(response.body.list)).toBe(true);
      expect(typeof response.body.total).toBe('number');
    });

    it('should search users by username', async () => {
      const response = await client
        .get(`/api/v1/user?start=1&limit=10&search=${client.user.username}`)
        .expect(HttpStatus.OK);

      expect(response.body.list.length).toBeGreaterThan(0);
      const foundUser = response.body.list.find(
        (user: any) => user.username === client.user.username,
      );
      expect(foundUser).toBeDefined();
      expect(foundUser.id).toBe(client.user.id);
    });

    it('should fail without authentication', async () => {
      await client
        .request()
        .get('/api/v1/user?start=1&limit=10')
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should validate required query parameters', async () => {
      await client.get('/api/v1/user').expect(HttpStatus.BAD_REQUEST);
    });

    it('should handle invalid start parameter', async () => {
      await client
        .get('/api/v1/user?start=invalid&limit=10')
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should handle invalid limit parameter', async () => {
      await client
        .get('/api/v1/user?start=1&limit=invalid')
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('GET /api/v1/user/:id', () => {
    it('should get user by id with authentication', async () => {
      const response = await client
        .get(`/api/v1/user/${client.user.id}`)
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('id', client.user.id);
      expect(response.body).toHaveProperty('username', client.user.username);
      expect(response.body).toHaveProperty('email', client.user.email);
      expect(response.body).not.toHaveProperty('password');
    });

    it('should get another user by id', async () => {
      const response = await client
        .get(`/api/v1/user/${secondClient.user.id}`)
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('id', secondClient.user.id);
      expect(response.body).toHaveProperty(
        'username',
        secondClient.user.username,
      );
      expect(response.body).toHaveProperty('email', secondClient.user.email);
      expect(response.body).not.toHaveProperty('password');
    });

    it('should return null for non-existent user', async () => {
      await client
        .get('/api/v1/user/00000000-0000-0000-0000-000000000000')
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should fail without authentication', async () => {
      await client
        .request()
        .get(`/api/v1/user/${client.user.id}`)
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('POST /api/v1/user/email/validate', () => {
    it('should validate new email address', async () => {
      const testEmail = `test-${Date.now()}@example.com`;

      await client
        .post('/api/v1/user/email/validate')
        .send({ email: testEmail })
        .expect(HttpStatus.CREATED);
    });

    it('should fail with invalid email format', async () => {
      await client
        .post('/api/v1/user/email/validate')
        .send({ email: 'invalid-email' })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should fail with existing email', async () => {
      // Use secondClient's email to test email already in use by another user
      await client
        .post('/api/v1/user/email/validate')
        .send({ email: secondClient.user.email })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should fail without authentication', async () => {
      await client
        .request()
        .post('/api/v1/user/email/validate')
        .send({ email: 'test@example.com' })
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('PATCH /api/v1/user/:id', () => {
    it('should update user username', async () => {
      const newUsername = `updated-${Date.now()}`;

      await client
        .patch(`/api/v1/user/${client.user.id}`)
        .send({ username: newUsername })
        .expect(HttpStatus.OK);

      // Verify the update
      const response = await client
        .get(`/api/v1/user/${client.user.id}`)
        .expect(HttpStatus.OK);

      expect(response.body.username).toBe(newUsername);

      // Update in-memory username to match DB for subsequent tests
      client.user.username = newUsername;
    });

    it('should fail without authentication', async () => {
      await client
        .request()
        .patch(`/api/v1/user/${client.user.id}`)
        .send({ username: 'newname' })
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should validate username length constraints', async () => {
      await client
        .patch(`/api/v1/user/${client.user.id}`)
        .send({ username: 'a' }) // Too short
        .expect(HttpStatus.BAD_REQUEST);

      await client
        .patch(`/api/v1/user/${client.user.id}`)
        .send({ username: 'a'.repeat(33) }) // Too long
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should validate email format when updating email', async () => {
      await client
        .patch(`/api/v1/user/${client.user.id}`)
        .send({ email: 'invalid-email' })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should fail to update another user', async () => {
      await client
        .patch(`/api/v1/user/${secondClient.user.id}`)
        .send({ username: 'hacker' })
        .expect(HttpStatus.FORBIDDEN);
    });
  });

  describe('Account Deletion', () => {
    describe('POST /api/v1/user/account/delete/initiate', () => {
      it('should fail with wrong username', async () => {
        await client
          .post('/api/v1/user/account/delete/initiate')
          .send({ username: 'wrong-username', url: 'http://localhost/confirm' })
          .expect(HttpStatus.BAD_REQUEST);
      });

      it('should fail without authentication', async () => {
        await client
          .request()
          .post('/api/v1/user/account/delete/initiate')
          .send({ username: 'test', url: 'http://localhost/confirm' })
          .expect(HttpStatus.UNAUTHORIZED);
      });

      it('should fail with missing username', async () => {
        await client
          .post('/api/v1/user/account/delete/initiate')
          .send({ url: 'http://localhost/confirm' })
          .expect(HttpStatus.BAD_REQUEST);
      });

      it('should fail with missing url', async () => {
        await client
          .post('/api/v1/user/account/delete/initiate')
          .send({ username: client.user.username })
          .expect(HttpStatus.BAD_REQUEST);
      });

      it('should fail when owner has other members in namespace (case 28)', async () => {
        // Create a namespace and add secondClient as a member
        const tempNamespace = await client
          .post('/api/v1/namespaces')
          .send({ name: `Delete Account Test ${Date.now()}` })
          .expect(HttpStatus.CREATED);

        const tempNamespaceId = tempNamespace.body.id;

        // Create invitation for secondClient
        const invitation = await client
          .post(`/api/v1/namespaces/${tempNamespaceId}/invitations`)
          .send({
            namespaceRole: 'member',
            rootPermission: 'can_view',
          })
          .expect(HttpStatus.CREATED);

        // secondClient accepts invitation
        await secondClient
          .post(
            `/api/v1/namespaces/${tempNamespaceId}/invitations/${invitation.body.id}/accept`,
          )
          .expect(HttpStatus.CREATED);

        // Now client (owner) tries to delete account - should fail (403 Forbidden)
        await client
          .post('/api/v1/user/account/delete/initiate')
          .send({
            username: client.user.username,
            url: 'http://localhost/confirm',
          })
          .expect(HttpStatus.FORBIDDEN);

        // Cleanup: remove secondClient from namespace
        await client
          .delete(
            `/api/v1/namespaces/${tempNamespaceId}/members/${secondClient.user.id}`,
          )
          .expect(HttpStatus.OK);

        // Cleanup: delete the namespace
        await client.delete(`/api/v1/namespaces/${tempNamespaceId}`);
      });
    });

    describe('POST /api/v1/user/account/delete/confirm', () => {
      it('should fail with invalid token', async () => {
        await client
          .request()
          .post('/api/v1/user/account/delete/confirm')
          .send({ token: 'invalid-token' })
          .expect(HttpStatus.BAD_REQUEST);
      });

      it('should fail with missing token', async () => {
        await client
          .request()
          .post('/api/v1/user/account/delete/confirm')
          .send({})
          .expect(HttpStatus.BAD_REQUEST);
      });
    });
  });

  describe('User Options', () => {
    const testOptionName = 'test-option';
    const testOptionValue = 'test-value';

    describe('POST /api/v1/user/option', () => {
      it('should create user option', async () => {
        await client
          .post('/api/v1/user/option')
          .send({
            name: testOptionName,
            value: testOptionValue,
          })
          .expect(HttpStatus.CREATED);
      });

      it('should update existing user option', async () => {
        const updatedValue = 'updated-value';

        await client
          .post('/api/v1/user/option')
          .send({
            name: testOptionName,
            value: updatedValue,
          })
          .expect(HttpStatus.CREATED); // The controller always returns 201 for this endpoint

        // Verify the update
        const response = await client
          .get(`/api/v1/user/option/${testOptionName}`)
          .expect(HttpStatus.OK);

        expect(response.body.value).toBe(updatedValue);
      });

      it('should fail without authentication', async () => {
        await client
          .request()
          .post('/api/v1/user/option')
          .send({
            name: 'test',
            value: 'test',
          })
          .expect(HttpStatus.UNAUTHORIZED);
      });

      it('should validate option name length', async () => {
        await client
          .post('/api/v1/user/option')
          .send({
            name: 'a'.repeat(65), // Too long
            value: 'test',
          })
          .expect(HttpStatus.BAD_REQUEST);
      });
    });

    describe('GET /api/v1/user/option/:name', () => {
      it('should get user option by name', async () => {
        const response = await client
          .get(`/api/v1/user/option/${testOptionName}`)
          .expect(HttpStatus.OK);

        expect(response.body).toHaveProperty('name', testOptionName);
        expect(response.body).toHaveProperty('value');
        expect(response.body).toHaveProperty('user_id', client.user.id);
      });

      it('should return null for non-existent option', async () => {
        const response = await client
          .get('/api/v1/user/option/non-existent')
          .expect(HttpStatus.OK);

        // NestJS returns empty object instead of null for non-existent entities
        expect(response.body).toEqual({});
      });

      it('should fail without authentication', async () => {
        await client
          .request()
          .get(`/api/v1/user/option/${testOptionName}`)
          .expect(HttpStatus.UNAUTHORIZED);
      });
    });
  });
});
