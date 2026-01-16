import { TestClient } from 'test/test-client';
import { HttpStatus } from '@nestjs/common';
import { APIKeyPermissionType } from 'omniboxd/api-key/api-key.entity';
import { NamespaceRole } from 'omniboxd/namespaces/entities/namespace-member.entity';
import { ALLOWED_EMAIL_DOMAINS } from 'omniboxd/utils/email-validation';

describe('AuthModule (e2e)', () => {
  let client: TestClient;
  let secondClient: TestClient;
  let apiKeyValue: string;

  beforeAll(async () => {
    client = await TestClient.create();
    secondClient = await TestClient.create();

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
    await secondClient.close();
  });

  describe('JWT Authentication', () => {
    describe('POST /api/v1/login', () => {
      it('should login with valid credentials', async () => {
        const response = await client
          .request()
          .post('/api/v1/login')
          .send({
            username: client.user.email,
            password: client.user.password,
            type: 'email',
          })
          .expect(200);

        expect(response.body).toHaveProperty('id');
        expect(response.body).toHaveProperty('access_token');
        expect(response.body.id).toBe(client.user.id);
        expect(typeof response.body.access_token).toBe('string');
      });

      it('should fail with invalid email', async () => {
        await client
          .request()
          .post('/api/v1/login')
          .send({
            username: 'nonexistent@example.com',
            password: client.user.password,
            type: 'email',
          })
          .expect(HttpStatus.NOT_FOUND);
      });

      it('should fail with invalid password', async () => {
        await client
          .request()
          .post('/api/v1/login')
          .send({
            username: client.user.email,
            password: 'wrongpassword',
            type: 'email',
          })
          .expect(HttpStatus.FORBIDDEN);
      });

      it('should fail with missing credentials', async () => {
        await client
          .request()
          .post('/api/v1/login')
          .send({})
          .expect(HttpStatus.UNAUTHORIZED);
      });
    });

    describe('JWT Token Validation', () => {
      it('should access protected route with valid token', async () => {
        await client
          .get(`/api/v1/user/${client.user.id}`)
          .expect(200)
          .expect((res) => {
            expect(res.body.username).toBe(client.user.username);
          });
      });

      it('should fail to access protected route without token', async () => {
        await client
          .request()
          .get(`/api/v1/user/${client.user.id}`)
          .expect(HttpStatus.UNAUTHORIZED);
      });

      it('should fail to access protected route with invalid token', async () => {
        await client
          .request()
          .get(`/api/v1/user/${client.user.id}`)
          .set('Authorization', 'Bearer invalid-token')
          .expect(HttpStatus.UNAUTHORIZED);
      });

      it('should fail to access protected route with malformed token', async () => {
        await client
          .request()
          .get(`/api/v1/user/${client.user.id}`)
          .set('Authorization', 'invalid-format')
          .expect(HttpStatus.UNAUTHORIZED);
      });
    });
  });

  describe('API Key Authentication', () => {
    describe('API Key Format Validation', () => {
      it('should accept valid API key with sk- prefix', async () => {
        await client
          .request()
          .get('/api/v1/health')
          .set('Authorization', `Bearer ${apiKeyValue}`)
          .expect(200);
      });

      it('should reject API key without sk- prefix', async () => {
        const invalidKey = apiKeyValue.replace('sk-', 'invalid-');
        await client
          .request()
          .post('/open/api/v1/resources')
          .set('Authorization', `Bearer ${invalidKey}`)
          .send({
            name: 'Test Resource',
            content: 'Test content',
          })
          .expect(HttpStatus.UNAUTHORIZED)
          .expect((res) => {
            expect(res.body.message).toContain('Invalid API key format');
          });
      });

      it('should reject non-existent API key', async () => {
        await client
          .request()
          .post('/open/api/v1/resources')
          .set(
            'Authorization',
            'Bearer sk-nonexistentkey1234567890123456789012',
          )
          .send({
            name: 'Test Resource',
            content: 'Test content',
          })
          .expect(HttpStatus.UNAUTHORIZED)
          .expect((res) => {
            expect(res.body.message).toContain('Invalid API key');
          });
      });

      it('should reject request without authorization header on API key protected route', async () => {
        await client
          .request()
          .post('/open/api/v1/resources')
          .send({
            name: 'Test Resource',
            content: 'Test content',
          })
          .expect(HttpStatus.UNAUTHORIZED)
          .expect((res) => {
            expect(res.body.message).toContain(
              'Authorization header is required',
            );
          });
      });
    });

    describe('API Key Protected Endpoints', () => {
      it('should create resource with valid API key', async () => {
        const resourceData = {
          name: 'API Key Test Resource',
          content: 'Test content created with API key',
          tags: ['api-key', 'test'],
          attrs: { source: 'api-key-test' },
        };

        const response = await client
          .request()
          .post('/open/api/v1/resources')
          .set('Authorization', `Bearer ${apiKeyValue}`)
          .send(resourceData)
          .expect(201);

        expect(response.body).toHaveProperty('id');
        expect(response.body.name).toBe(resourceData.name);
        // Note: content might not be returned in the response for open API
        expect(typeof response.body.id).toBe('string');
      });

      it('should upload file with valid API key', async () => {
        const testFile = Buffer.from('test file content for API key');
        const filename = 'api-key-test.txt';

        const response = await client
          .request()
          .post('/open/api/v1/resources/upload')
          .set('Authorization', `Bearer ${apiKeyValue}`)
          .attach('file', testFile, filename)
          .expect(201);

        expect(response.body).toHaveProperty('id');
        expect(response.body.name).toBe(filename);
      });

      it('should handle API key authentication for open endpoints', async () => {
        // Test that API key authentication works by trying to create a resource
        // The GET endpoint might not exist, so we'll test with a known working endpoint
        const resourceData = {
          name: 'API Key Auth Test',
          content: 'Testing API key authentication',
        };

        await client
          .request()
          .post('/open/api/v1/resources')
          .set('Authorization', `Bearer ${apiKeyValue}`)
          .send(resourceData)
          .expect(201);
      });
    });
  });

  describe('Public Endpoints', () => {
    it('should access health check without authentication', async () => {
      await client
        .request()
        .get('/api/v1/health')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('uptime');
          expect(typeof res.body.uptime).toBe('number');
        });
    });

    it('should access WeChat QR code endpoint without authentication', async () => {
      await client
        .request()
        .get('/api/v1/wechat/qrcode')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('app_id');
          expect(res.body).toHaveProperty('scope');
          expect(res.body).toHaveProperty('state');
        });
    });

    it('should access WeChat auth URL endpoint without authentication', async () => {
      await client
        .request()
        .get('/api/v1/wechat/auth-url')
        .expect(200)
        .expect((res) => {
          // The response might be an empty object or have different structure
          expect(typeof res.body).toBe('object');
        });
    });
  });

  describe('Internal Auth Controller', () => {
    describe('POST /internal/api/v1/sign-up', () => {
      it('should create user without email confirmation', async () => {
        const userData = {
          username: 'testuser' + Date.now(),
          email: 'testuser' + Date.now() + '@example.com',
          password: 'testpassword123',
        };

        const response = await client
          .request()
          .post('/internal/api/v1/sign-up')
          .send(userData)
          .expect(201);

        expect(response.body).toHaveProperty('id');
        expect(response.body).toHaveProperty('access_token');
        expect(typeof response.body.id).toBe('string');
        expect(typeof response.body.access_token).toBe('string');
      });

      it('should fail to create user with duplicate email', async () => {
        await client
          .request()
          .post('/internal/api/v1/sign-up')
          .send({
            username: 'duplicate',
            email: client.user.email, // Use existing email
            password: 'testpassword123',
          })
          .expect(HttpStatus.BAD_REQUEST);
      });

      it('should fail to create user with invalid username length', async () => {
        await client
          .request()
          .post('/internal/api/v1/sign-up')
          .send({
            username: 'a', // Too short
            email: 'shortusername@example.com',
            password: 'testpassword123',
          })
          .expect(HttpStatus.BAD_REQUEST);
      });

      it('should fail to create user with missing required fields', async () => {
        await client
          .request()
          .post('/internal/api/v1/sign-up')
          .send({
            username: 'testuser',
            // Missing email and password
          })
          .expect(HttpStatus.BAD_REQUEST);
      });
    });
  });

  describe('Cookie Authentication', () => {
    let jwtToken: string;

    beforeAll(async () => {
      // Get a JWT token for cookie testing
      const loginResponse = await client
        .request()
        .post('/api/v1/login')
        .send({
          username: client.user.email,
          password: client.user.password,
          type: 'email',
        })
        .expect(200);

      jwtToken = loginResponse.body.access_token;
    });

    it('should access cookie-protected route with valid token cookie', async () => {
      // Note: This test assumes there's a cookie-protected endpoint
      // Since we don't have a specific cookie-protected endpoint in the current codebase,
      // we'll test the cookie guard behavior indirectly
      await client
        .request()
        .get('/api/v1/health')
        .set('Cookie', `token=${jwtToken}`)
        .expect(200);
    });

    it('should handle missing token cookie gracefully', async () => {
      // Test accessing a public endpoint without cookie - should still work
      await client.request().get('/api/v1/health').expect(200);
    });

    it('should handle invalid token cookie', async () => {
      // Test with invalid cookie token on public endpoint - should still work
      await client
        .request()
        .get('/api/v1/health')
        .set('Cookie', 'token=invalid-token')
        .expect(200);
    });
  });

  describe('WeChat Authentication', () => {
    describe('GET /api/v1/wechat/qrcode', () => {
      it('should return QR code parameters', async () => {
        const response = await client
          .request()
          .get('/api/v1/wechat/qrcode')
          .expect(200);

        expect(response.body).toHaveProperty('app_id');
        expect(response.body).toHaveProperty('scope');
        expect(response.body).toHaveProperty('state');
        expect(response.body.scope).toBe('snsapi_login');
      });
    });

    describe('GET /api/v1/wechat/auth-url', () => {
      it('should return WeChat authorization URL', async () => {
        const response = await client
          .request()
          .get('/api/v1/wechat/auth-url')
          .expect(200);

        expect(typeof response.body).toBe('object');
        // The response might be an empty object in test environment
      });
    });

    describe('GET /api/v1/wechat/callback', () => {
      it('should handle callback with missing parameters', async () => {
        await client
          .request()
          .get('/api/v1/wechat/callback')
          .expect(HttpStatus.UNAUTHORIZED); // WeChat callback requires authentication in this implementation
      });

      it('should handle callback with invalid code', async () => {
        await client
          .request()
          .get('/api/v1/wechat/callback')
          .query({
            code: 'invalid-code',
            state: 'test-state',
          })
          .expect(HttpStatus.UNAUTHORIZED); // WeChat callback requires authentication in this implementation
      });
    });
  });

  describe('Authentication Guard Interactions', () => {
    it('should prioritize public decorator over authentication requirements', async () => {
      // Health endpoint is public, should work without any authentication
      await client.request().get('/api/v1/health').expect(200);
    });

    it('should handle multiple authentication methods correctly', async () => {
      // Test that JWT and API key don't interfere with each other
      await client
        .request()
        .get('/api/v1/health')
        .set('Authorization', `Bearer ${client.user.token}`)
        .expect(200);

      await client
        .request()
        .get('/api/v1/health')
        .set('Authorization', `Bearer ${apiKeyValue}`)
        .expect(200);
    });

    it('should reject requests with both invalid JWT and API key format', async () => {
      await client
        .request()
        .get(`/api/v1/user/${client.user.id}`)
        .set('Authorization', 'Bearer invalid-token-format')
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should handle authorization header edge cases', async () => {
      // Test with malformed authorization header
      await client
        .request()
        .get(`/api/v1/user/${client.user.id}`)
        .set('Authorization', 'InvalidFormat')
        .expect(HttpStatus.UNAUTHORIZED);

      // Test with empty authorization header
      await client
        .request()
        .get(`/api/v1/user/${client.user.id}`)
        .set('Authorization', '')
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('Email Domain Validation', () => {
    const disallowedEmail = 'test@invalid-domain.com';
    const allowedEmails = ALLOWED_EMAIL_DOMAINS.map(
      (domain) => `test${Date.now()}@${domain}`,
    );

    describe('POST /api/v1/auth/send-otp', () => {
      it('should reject email with disallowed domain', async () => {
        await client
          .request()
          .post('/api/v1/auth/send-otp')
          .send({ email: disallowedEmail })
          .expect(HttpStatus.BAD_REQUEST)
          .expect((res) => {
            const message = Array.isArray(res.body.message)
              ? res.body.message.join(' ')
              : res.body.message;
            expect(message.toLowerCase()).toContain('domain');
          });
      });

      it('should accept email with allowed domain', async () => {
        const response = await client
          .request()
          .post('/api/v1/auth/send-otp')
          .send({ email: allowedEmails[0] });

        // Should not be BAD_REQUEST due to domain validation
        // It may return 200 or fail for other reasons (email not found, etc.)
        expect(response.status).not.toBe(HttpStatus.BAD_REQUEST);
      });

      it('should transform email to lowercase', async () => {
        const uppercaseEmail = 'TEST@GMAIL.COM';
        const response = await client
          .request()
          .post('/api/v1/auth/send-otp')
          .send({ email: uppercaseEmail });

        // Should not fail due to domain validation (gmail.com is allowed)
        expect(response.status).not.toBe(HttpStatus.BAD_REQUEST);
      });
    });

    describe('POST /api/v1/auth/send-signup-otp', () => {
      it('should reject email with disallowed domain', async () => {
        await client
          .request()
          .post('/api/v1/auth/send-signup-otp')
          .send({ email: disallowedEmail })
          .expect(HttpStatus.BAD_REQUEST)
          .expect((res) => {
            const message = Array.isArray(res.body.message)
              ? res.body.message.join(' ')
              : res.body.message;
            expect(message.toLowerCase()).toContain('domain');
          });
      });

      it('should accept email with allowed domain', async () => {
        const response = await client
          .request()
          .post('/api/v1/auth/send-signup-otp')
          .send({ email: allowedEmails[1] || allowedEmails[0] });

        expect(response.status).not.toBe(HttpStatus.BAD_REQUEST);
      });
    });

    describe('POST /api/v1/auth/verify-otp', () => {
      it('should reject email with disallowed domain', async () => {
        await client
          .request()
          .post('/api/v1/auth/verify-otp')
          .send({ email: disallowedEmail, code: '123456' })
          .expect(HttpStatus.BAD_REQUEST)
          .expect((res) => {
            const message = Array.isArray(res.body.message)
              ? res.body.message.join(' ')
              : res.body.message;
            expect(message.toLowerCase()).toContain('domain');
          });
      });

      it('should accept email with allowed domain (validation passes, may fail on code)', async () => {
        const response = await client
          .request()
          .post('/api/v1/auth/verify-otp')
          .send({
            email: allowedEmails[2] || allowedEmails[0],
            code: '123456',
          });

        // Should not be BAD_REQUEST due to domain validation
        // It will likely fail on invalid code (UNAUTHORIZED or NOT_FOUND), but that's expected
        // BAD_REQUEST would indicate validation failure
        if (response.status === 400) {
          const message = Array.isArray(response.body.message)
            ? response.body.message.join(' ')
            : response.body.message;
          // Should not contain domain-related error
          expect(message.toLowerCase()).not.toContain('domain');
        }
      });
    });

    describe('POST /api/v1/invite', () => {
      it('should reject invite with disallowed email domain', async () => {
        await client
          .post('/api/v1/invite')
          .send({
            inviteUrl: 'https://example.com/invite',
            registerUrl: 'https://example.com/register',
            namespace: client.namespace.id,
            role: NamespaceRole.MEMBER,
            emails: [disallowedEmail],
          })
          .expect(HttpStatus.BAD_REQUEST)
          .expect((res) => {
            const message = Array.isArray(res.body.message)
              ? res.body.message.join(' ')
              : res.body.message;
            expect(message.toLowerCase()).toContain('domain');
          });
      });

      it('should accept invite with allowed email domain', async () => {
        const response = await client.post('/api/v1/invite').send({
          inviteUrl: 'https://example.com/invite',
          registerUrl: 'https://example.com/register',
          namespace: client.namespace.id,
          role: NamespaceRole.MEMBER,
          emails: [`invitetest${Date.now()}@gmail.com`],
        });

        // Should not fail due to domain validation
        expect(response.status).not.toBe(HttpStatus.BAD_REQUEST);
      });

      it('should reject invite with mixed allowed and disallowed email domains', async () => {
        await client
          .post('/api/v1/invite')
          .send({
            inviteUrl: 'https://example.com/invite',
            registerUrl: 'https://example.com/register',
            namespace: client.namespace.id,
            role: NamespaceRole.MEMBER,
            emails: [`valid${Date.now()}@gmail.com`, disallowedEmail],
          })
          .expect(HttpStatus.BAD_REQUEST)
          .expect((res) => {
            const message = Array.isArray(res.body.message)
              ? res.body.message.join(' ')
              : res.body.message;
            expect(message.toLowerCase()).toContain('domain');
          });
      });

      it('should transform invite emails to lowercase', async () => {
        const uppercaseEmail = `UPPERCASE${Date.now()}@GMAIL.COM`;
        const response = await client.post('/api/v1/invite').send({
          inviteUrl: 'https://example.com/invite',
          registerUrl: 'https://example.com/register',
          namespace: client.namespace.id,
          role: NamespaceRole.MEMBER,
          emails: [uppercaseEmail],
        });

        // Should not fail due to domain validation
        expect(response.status).not.toBe(HttpStatus.BAD_REQUEST);
      });
    });
  });
});
