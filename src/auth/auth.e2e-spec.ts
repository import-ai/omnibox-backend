import { TestClient } from 'test/test-client';

describe('UserController (e2e)', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = await TestClient.create();
  });

  afterAll(async () => {
    await client.close();
  });

  it('should login with valid credentials', async () => {
    const response = await client
      .request()
      .post('/api/v1/login')
      .send({
        email: client.user.email,
        password: client.user.password,
      })
      .expect(200);

    expect(response.body).toHaveProperty('id');
    expect(response.body).toHaveProperty('access_token');

    expect(response.body.id).toBe(client.user.id);
  });

  it('should access protected route with valid token', async () => {
    return await client
      .get(`/api/v1/user/${client.user.id}`)
      .expect(200)
      .expect((res) => {
        expect(res.body.username).toBe(client.user.username);
      });
  });

  it('should reject invalid token', async () => {
    return await client
      .get(`/api/v1/user/${client.user.id}`)
      .set('Authorization', `Bearer fake-token`)
      .expect(401)
      .expect((res) => {
        expect(res.body).toHaveProperty('message');
      });
  });
});
