import { TestClient } from 'test/test-client';

describe('SharesController (e2e)', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = await TestClient.create();
  });

  afterAll(async () => {
    await client.close();
  });

  it('update and get share info', async () => {
    const password = 'test-password';
    let res = await client
      .patch(
        `/api/v1/namespaces/${client.namespace.id}/resources/${client.namespace.root_resource_id}/share`,
      )
      .send({
        enabled: true,
        password,
      });
    expect(res.status).toBe(200);

    res = await client.get(
      `/api/v1/namespaces/${client.namespace.id}/resources/${client.namespace.root_resource_id}/share`,
    );
    expect(res.status).toBe(200);
    expect(res.body.namespace_id).toBe(client.namespace.id);
    expect(res.body.resource_id).toBe(client.namespace.root_resource_id);
    expect(res.body.enabled).toBe(true);
    expect(res.body.password_enabled).toBe(true);
  });

  it('allows trusted internal reads for protected shares', async () => {
    const shareUrl = `/api/v1/namespaces/${client.namespace.id}/resources/${client.namespace.root_resource_id}/share`;
    const passwordShare = await client.patch(shareUrl).send({
      enabled: true,
      password: 'test-password',
      require_login: false,
    });
    expect(passwordShare.status).toBe(200);

    const shareId = passwordShare.body.id;
    const publicShareUrl = `/api/v1/shares/${shareId}`;
    const internalRootsUrl = `/internal/api/v1/shares/${shareId}/resources/roots`;

    await client.request().get(publicShareUrl).expect(403);
    await client.request().get(internalRootsUrl).expect(200);

    const loginShare = await client.patch(shareUrl).send({
      password: null,
      require_login: true,
    });
    expect(loginShare.status).toBe(200);

    await client.request().get(publicShareUrl).expect(401);
    await client.request().get(internalRootsUrl).expect(200);

    await client.patch(shareUrl).send({ enabled: false }).expect(200);
    await client.request().get(internalRootsUrl).expect(404);
  });
});
