import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app/app.module';

const randomString = (length: number): string => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

describe('UserController (e2e)', () => {
  let token: string;
  let app: INestApplication<App>;
  let username: string;
  let password: string;
  let email: string;
  let namespace: string;
  let userId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    username = randomString(10);
    password = randomString(12);
    email = randomString(15) + '@example.com';
    namespace = randomString(8);

    const response = await request(app.getHttpServer())
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

      token = response.body.access_token;
      userId = response.body.id;
  });

  it('should login with valid credentials', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/login')
      .send({
        email: email,
        password: password,
      })
      .expect(200);

    expect(response.body).toHaveProperty('id');
    expect(response.body).toHaveProperty('access_token');
  });

  it('should access protected route with valid token', async () => {
    return await request(app.getHttpServer())
      .get(`/api/v1/user/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect((res) => {
        expect(res.body.username).toBe(username);
      });
  });

  it('should reject invalid token', async () => {
    return await request(app.getHttpServer())
      .get(`/api/v1/user/${userId}`)
      .set('Authorization', 'Bearer invalid_token')
      .expect(401)
      .expect((res) => {
        expect(res.body).toHaveProperty('message');
      });
  });
});
