import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from 'src/app/app.module';

export type SignUpResponse = {
  id: string;
  email: string;
  username: string;
  password: string;
  namespace: {
    id: string;
    name: string;
  };
  token: string;
};

export const randomString = (length: number): string => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};

export const signUp = async (
  app: INestApplication,
): Promise<SignUpResponse> => {
  const username: string = randomString(10);
  const password: string = randomString(12);
  const email: string = randomString(15) + '@example.com';
  const namespace: string = randomString(8);

  const userCreateResponse = await request(app.getHttpServer())
    .post('/internal/api/v1/sign-up')
    .send({
      username: username,
      password: password,
      password_repeat: password,
      email: email,
    })
    .expect(201)
    .expect((res) => {
      expect(res.body).toHaveProperty('id');
      expect(res.body.username).toBe(username);
      expect(res.body.password).toBeUndefined();
    });

  const token = userCreateResponse.body.access_token;

  const namespaceCreateResponse = await request(app.getHttpServer())
    .post('/api/v1/namespaces')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: namespace,
    })
    .expect(201)
    .expect((res) => {
      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe(namespace);
    });

  return {
    id: userCreateResponse.body.id,
    email,
    username,
    password,
    token,
    namespace: namespaceCreateResponse.body,
  };
};

describe('UserController (e2e)', () => {
  let app: INestApplication<App>;
  let user: SignUpResponse;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    user = await signUp(app);
  });

  it('should login with valid credentials', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/login')
      .send({
        email: user.email,
        password: user.password,
      })
      .expect(200);

    expect(response.body).toHaveProperty('id');
    expect(response.body).toHaveProperty('access_token');
  });

  it('should access protected route with valid token', async () => {
    return await request(app.getHttpServer())
      .get(`/api/v1/user/${user.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200)
      .expect((res) => {
        expect(res.body.username).toBe(user.username);
      });
  });

  it('should reject invalid token', async () => {
    return await request(app.getHttpServer())
      .get(`/api/v1/user/${user.id}`)
      .set('Authorization', 'Bearer invalid_token')
      .expect(401)
      .expect((res) => {
        expect(res.body).toHaveProperty('message');
      });
  });
});
