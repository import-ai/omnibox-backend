import { ShareAccessTokenService } from 'omniboxd/shares/share-access-token.service';
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

    const accessToken = client.app.get(ShareAccessTokenService).mint(shareId);
    const otherShareToken = client.app
      .get(ShareAccessTokenService)
      .mint('0000000000');
    const trusted = () =>
      client.request().get(internalRootsUrl).set('x-share-access', accessToken);

    await client.request().get(publicShareUrl).expect(403);
    // Only the token minted for this share after the visitor was validated
    // opens the trusted path; without it the share is validated as a visitor.
    await trusted().expect(200);
    await client.request().get(internalRootsUrl).expect(403);
    await client
      .request()
      .get(internalRootsUrl)
      .set('x-share-access', otherShareToken)
      .expect(403);
    await client
      .request()
      .get(internalRootsUrl)
      .set('x-user-id', client.user.id)
      .expect(403);

    const loginShare = await client.patch(shareUrl).send({
      password: null,
      require_login: true,
    });
    expect(loginShare.status).toBe(200);

    await client.request().get(publicShareUrl).expect(401);
    await trusted().expect(200);
    await client.request().get(internalRootsUrl).expect(401);
    await client
      .request()
      .get(internalRootsUrl)
      .set('x-user-id', client.user.id)
      .expect(200);

    await client.patch(shareUrl).send({ enabled: false }).expect(200);
    await trusted().expect(404);
  });
});
