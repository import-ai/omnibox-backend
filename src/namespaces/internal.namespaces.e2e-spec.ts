import { HttpStatus } from '@nestjs/common';
import { TestClient } from 'test/test-client';

describe('InternalNamespacesController (e2e)', () => {
  let client: TestClient;
  let otherClient: TestClient;

  beforeAll(async () => {
    client = await TestClient.create();
    otherClient = await TestClient.create();
  });

  afterAll(async () => {
    await client.close();
    await otherClient.close();
  });

  it('returns current user, namespace, tier, usage and quota information', async () => {
    const response = await client
      .request()
      .get(`/internal/api/v1/namespaces/${client.namespace.id}/info`)
      .set('X-User-ID', client.user.id)
      .expect(HttpStatus.OK);

    expect(response.body).toMatchObject({
      user: {
        id: client.user.id,
        username: client.user.username,
        email: client.user.email,
      },
      namespace: {
        id: client.namespace.id,
        name: client.namespace.name,
        tier: 'basic',
      },
      namespace_usage: {
        readonly: false,
      },
      open_api_requests_quota: {
        limit: 0,
        used: 0,
        remaining: null,
        reset_at: null,
      },
    });
  });

  it('rejects a user outside the namespace', async () => {
    await client
      .request()
      .get(`/internal/api/v1/namespaces/${client.namespace.id}/info`)
      .set('X-User-ID', otherClient.user.id)
      .expect(HttpStatus.FORBIDDEN);
  });
});
