import { TestClient } from 'test/test-client';
import { HttpStatus } from '@nestjs/common';

describe('OAuthModule (e2e)', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = await TestClient.create();
  });

  afterAll(async () => {
    await client.close();
  });

  describe('OAuth Endpoints', () => {
    it('should have OAuth endpoints available', async () => {
      // Test that OAuth authorization endpoint exists (should redirect for unauthenticated)
      const authorizeResponse = await client
        .request()
        .get('/oauth/authorize')
        .query({
          response_type: 'code',
          client_id: 'test_client',
          redirect_uri: 'https://example.com/callback',
        });

      // Should redirect to login or return error, not 404
      expect([302, 400, 401, 500]).toContain(authorizeResponse.status);
    });

    it('should reject invalid token requests', async () => {
      const response = await client.request().post('/oauth/token').send({
        grant_type: 'authorization_code',
        code: 'invalid_code',
        redirect_uri: 'https://example.com/callback',
        client_id: 'invalid_client',
      });

      // Should return OAuth error response
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('error');
    });

    it('should require authentication for userinfo', async () => {
      await client
        .request()
        .get('/oauth/userinfo')
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should reject requests without Bearer token', async () => {
      await client
        .request()
        .get('/oauth/userinfo')
        .set('Authorization', 'Invalid token')
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should require authentication for client creation', async () => {
      await client
        .request()
        .post('/oauth/clients')
        .send({
          name: 'Test Client',
          redirect_uris: ['https://example.com/callback'],
        })
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('OAuth Security', () => {
    it('should validate grant_type in token requests', async () => {
      const response = await client.request().post('/oauth/token').send({
        grant_type: 'invalid_grant',
        code: 'test_code',
        client_id: 'test_client',
      });

      expect([200, 400]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body.error).toBe('unsupported_grant_type');
      }
    });

    it('should validate required parameters in authorization', async () => {
      const response = await client.request().get('/oauth/authorize').query({
        response_type: 'token', // Invalid response type
        client_id: 'test_client',
        redirect_uri: 'https://example.com/callback',
      });

      // Should redirect with error or return error response
      expect([302, 400]).toContain(response.status);
    });
  });
});
