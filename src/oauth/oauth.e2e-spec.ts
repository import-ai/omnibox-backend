import { TestClient } from 'test/test-client';
import { HttpStatus } from '@nestjs/common';

describe('OAuthModule (e2e)', () => {
  let client: TestClient;
  let oauthClient: {
    client_id: string;
    client_secret?: string;
    redirect_uris: string[];
  };

  beforeAll(async () => {
    client = await TestClient.create();

    // Create OAuth client for testing
    const createClientResponse = await client
      .post('/internal/api/v1/oauth/clients')
      .send({
        name: 'Test OAuth Client',
        description: 'Client for e2e testing',
        redirect_uris: ['https://example.com/callback'],
        scopes: ['openid', 'profile', 'email'],
        grants: ['authorization_code'],
        is_confidential: false,
      })
      .expect(201);

    oauthClient = createClientResponse.body;
  });

  afterAll(async () => {
    await client.close();
  });

  describe('OAuth Endpoints', () => {
    it('should have OAuth endpoints available', async () => {
      // Test that OAuth authorization endpoint exists (should redirect for unauthenticated)
      const authorizeResponse = await client
        .request()
        .get('/api/v1/oauth/authorize')
        .query({
          response_type: 'code',
          client_id: 'test_client',
          redirect_uri: 'https://example.com/callback',
        });

      // Should redirect to login or return error, not 404
      expect([302, 400, 401, 500]).toContain(authorizeResponse.status);
    });

    it('should reject invalid token requests', async () => {
      const response = await client.request().post('/api/v1/oauth/token').send({
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
        .get('/api/v1/oauth/userinfo')
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should reject requests without Bearer token', async () => {
      await client
        .request()
        .get('/api/v1/oauth/userinfo')
        .set('Authorization', 'Invalid token')
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should successfully process OAuth authorize request with valid client', async () => {
      const authorizeResponse = await client
        .get('/api/v1/oauth/authorize')
        .query({
          response_type: 'code',
          client_id: oauthClient.client_id,
          redirect_uri: oauthClient.redirect_uris[0],
          scope: 'openid profile email',
          state: 'test_state_123',
        });

      // OAuth authorize endpoint correctly redirects to login for authentication
      expect(authorizeResponse.status).toBe(HttpStatus.FOUND);
      expect(authorizeResponse.headers.location).toContain('/api/v1/login');
      expect(authorizeResponse.headers.location).toContain('redirect=');

      // Verify the redirect preserves the original OAuth parameters (URL encoded)
      const redirectUrl = decodeURIComponent(
        authorizeResponse.headers.location,
      );
      expect(redirectUrl).toContain('client_id=' + oauthClient.client_id);
      expect(redirectUrl).toContain('response_type=code');
      expect(redirectUrl).toContain('state=test_state_123');
    });

    it('should preserve PKCE parameters in authorize redirect', async () => {
      const authorizeResponse = await client
        .get('/api/v1/oauth/authorize')
        .query({
          response_type: 'code',
          client_id: oauthClient.client_id,
          redirect_uri: oauthClient.redirect_uris[0],
          scope: 'openid profile',
          state: 'test_state_456',
          code_challenge: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
          code_challenge_method: 'S256',
        });

      // Should redirect to login and preserve PKCE parameters
      expect(authorizeResponse.status).toBe(HttpStatus.FOUND);
      expect(authorizeResponse.headers.location).toContain('/api/v1/login');

      // Verify PKCE and other parameters are preserved in redirect (URL encoded)
      const redirectUrl = decodeURIComponent(
        authorizeResponse.headers.location,
      );
      expect(redirectUrl).toContain(
        'code_challenge=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
      );
      expect(redirectUrl).toContain('code_challenge_method=S256');
      expect(redirectUrl).toContain('state=test_state_456');
    });
  });

  describe('Internal OAuth Endpoints', () => {
    it('should require authentication for client creation', async () => {
      await client
        .request()
        .post('/internal/api/v1/oauth/clients')
        .send({
          name: 'Test Client',
          redirect_uris: ['https://example.com/callback'],
        })
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should not expose client creation on public OAuth endpoint', async () => {
      await client
        .request()
        .post('/api/v1/oauth/clients')
        .send({
          name: 'Test Client',
          redirect_uris: ['https://example.com/callback'],
        })
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('OAuth Security', () => {
    it('should validate grant_type in token requests', async () => {
      const response = await client.request().post('/api/v1/oauth/token').send({
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
      const response = await client
        .request()
        .get('/api/v1/oauth/authorize')
        .query({
          response_type: 'token', // Invalid response type
          client_id: 'test_client',
          redirect_uri: 'https://example.com/callback',
        });

      // Should redirect with error or return error response
      expect([302, 400]).toContain(response.status);
    });
  });
});
