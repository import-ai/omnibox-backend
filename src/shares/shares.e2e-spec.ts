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
});
