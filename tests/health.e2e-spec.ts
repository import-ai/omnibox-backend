import { TestClient } from 'tests/test-client';

describe('Health', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = await TestClient.create();
  });

  afterAll(async () => {
    await client.close();
  });

  it('should health', async () => {
    await client.get('/api/v1/health').expect(200);
  });
});
