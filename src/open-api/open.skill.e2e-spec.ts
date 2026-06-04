import { TestClient } from 'test/test-client';

describe('OpenSkillController (e2e)', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = await TestClient.create();
  });

  afterAll(async () => {
    await client.close();
  });

  it('should render the Open API skill markdown with the configured base URL', async () => {
    const response = await client
      .request()
      .get('/open/api/v1/SKILL.md')
      .expect(200);

    expect(response.headers['content-type']).toContain('text/markdown');
    expect(response.text).toContain('/open/api/v1');
    expect(response.text).not.toContain('${OBB_OPEN_API_BASE_URL}');
  });
});
