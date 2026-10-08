import { createHash } from 'node:crypto';

import { AuthService } from 'omniboxd/auth/auth.service';
import { TestClient } from 'test/test-client';

import { OAuthClientService } from './oauth-client.service';
import { OAuthProviderService } from './oauth-provider.service';

const verifier = 'a'.repeat(43);
const challenge = createHash('sha256').update(verifier).digest('base64url');
const authorize = {
  client_id: 'omnibox-desktop',
  response_type: 'code',
  redirect_uri: 'omnibox://oauth/callback',
  state: 's'.repeat(43),
  code_challenge: challenge,
  code_challenge_method: 'S256',
};

describe('Shared OAuth first-party and third-party authorization', () => {
  let client: TestClient;
  beforeAll(async () => {
    client = await TestClient.create();
  });
  afterAll(async () => {
    await client?.close();
  });
  const issue = async (params = authorize) => {
    const res = await client
      .post('/api/v1/oauth/authorize')
      .send({ ...params, user_id: client.user.id })
      .expect(201);
    expect(res.headers['cache-control']).toBe('no-store');
    const callback = new URL(res.body.redirect_url);
    expect(callback.searchParams.get('state')).toBe(params.state);
    return callback.searchParams.get('code')!;
  };
  const exchange = (code: string) => ({
    grant_type: 'authorization_code',
    client_id: authorize.client_id,
    redirect_uri: authorize.redirect_uri,
    code,
    code_verifier: verifier,
  });

  it('requires the built-in desktop client, explicit bearer confirmation and S256', async () => {
    const context = await client
      .get('/api/v1/oauth/authorize/context')
      .query(authorize)
      .expect(200);
    expect(context.body.account.id).toBe(client.user.id);
    await client.get('/api/v1/oauth/authorize').query(authorize).expect(400);
    await client
      .request()
      .post('/api/v1/oauth/authorize')
      .set('Cookie', `token=${client.user.token}`)
      .send({ ...authorize, user_id: client.user.id })
      .expect(400);
    await client
      .post('/api/v1/oauth/authorize')
      .send({ ...authorize, user_id: 'another-user' })
      .expect(400);
    for (const patch of [
      { code_challenge_method: 'plain' },
      { code_challenge: '' },
      { state: '' },
      { redirect_uri: 'omnibox://app/callback' },
      { client_id: 'unknown' },
    ]) {
      await client
        .post('/api/v1/oauth/authorize')
        .send({ ...authorize, ...patch, user_id: client.user.id })
        .expect(400);
    }
    await expect(
      client.app.get(OAuthClientService).create({
        clientId: 'omnibox-desktop',
        name: 'Imposter',
        redirectUris: ['https://example.com'],
      }),
    ).rejects.toThrow();
  });

  it('exchanges once for a usable product JWT, without consuming invalid proofs', async () => {
    const code = await issue();
    for (const patch of [
      { code_verifier: 'b'.repeat(43) },
      { client_id: 'wrong' },
      { redirect_uri: 'omnibox://oauth/other' },
    ]) {
      await client
        .request()
        .post('/api/v1/oauth/token')
        .send({ ...exchange(code), ...patch })
        .expect(400);
    }
    const { body: credential } = await client
      .request()
      .post('/api/v1/oauth/token')
      .send(exchange(code))
      .expect(201);
    await client
      .request()
      .post('/api/v1/oauth/token')
      .send(exchange(code))
      .expect(400);
    expect(credential.id).toBe(client.user.id);
    expect(credential.token_type).toBe('Bearer');
    expect(credential.expires_in).toBeGreaterThan(0);
    expect(
      client.app.get(AuthService).jwtVerify(credential.access_token).sub,
    ).toBe(client.user.id);
    await client
      .request()
      .get(`/api/v1/user/${client.user.id}`)
      .set('Authorization', `Bearer ${credential.access_token}`)
      .expect(200);
  });

  it('allows exactly one concurrent exchange for an authorization code', async () => {
    const code = await issue();
    const service = client.app.get(OAuthProviderService);
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => service.exchangeToken(exchange(code))),
    );
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
  });

  it('preserves third-party secret and PKCE flows without granting a product JWT', async () => {
    const thirdParty = await client.app.get(OAuthClientService).create({
      clientId: `oauth-test-${Date.now()}`,
      name: 'Third party',
      redirectUris: ['https://example.com/callback'],
    });
    const params = {
      ...authorize,
      client_id: thirdParty.clientId,
      redirect_uri: thirdParty.redirectUris[0],
    };
    for (const pkce of [false, true]) {
      const query: Record<string, string> = { ...params };
      if (!pkce) {
        delete query.code_challenge;
        delete query.code_challenge_method;
      }
      const issued = await client
        .get('/api/v1/oauth/authorize')
        .query(query)
        .expect(200);
      const code = new URL(issued.body.redirect_url).searchParams.get('code');
      const tokenBody = {
        grant_type: 'authorization_code',
        code,
        client_id: params.client_id,
        redirect_uri: params.redirect_uri,
        ...(pkce
          ? { code_verifier: verifier }
          : { client_secret: thirdParty.clientSecret }),
      };
      const res = await client
        .request()
        .post('/api/v1/oauth/token')
        .send(tokenBody)
        .expect(201);
      expect(res.body.id).toBeUndefined();
      expect(res.body.access_token).toMatch(/^[a-f0-9]{64}$/);
      const info = await client
        .request()
        .get('/api/v1/oauth/userinfo')
        .set('Authorization', `Bearer ${res.body.access_token}`)
        .expect(200);
      expect(info.body.email).toBe(client.user.email);
      await client
        .request()
        .get(`/api/v1/user/${client.user.id}`)
        .set('Authorization', `Bearer ${res.body.access_token}`)
        .expect(401);
      await client
        .request()
        .post('/api/v1/oauth/token')
        .send(tokenBody)
        .expect(400);
    }
  });
});
