import { TestClient } from 'test/test-client';

describe('VFS (e2e)', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = await TestClient.create();
  });

  afterAll(async () => {
    await client.close();
  });

  describe('Create', () => {
    it('Create with exists path', async () => {
      const createResponse = await client
        .put(`/internal/api/v1/namespaces/${client.namespace.id}/vfs`)
        .send({
          path: '/private/hello.md',
          content: 'Hello World!',
        })
        .expect(201);
      console.log(createResponse.body);
    });
  });
});
