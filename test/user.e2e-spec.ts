import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app/app.module';

describe('UserController (e2e)', () => {
  let token: string;
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should sign up a new user', () => {
    return request(app.getHttpServer())
      .post('/api/v1/user')
      .send({
        username: 'wenguang',
        password: 'Admin1234',
        password_repeat: 'Admin1234',
        email: '295504163@qq.com',
      })
      .expect(201)
      .expect((res) => {
        expect(res.body).toHaveProperty('id');
        expect(res.body.username).toBe('wenguang');
        expect(res.body.password).toBeUndefined();
      });
  });

  it('should login with valid credentials', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/login')
      .send({
        email: '295504163@qq.com',
        password: 'Admin1234',
      })
      .expect(200);

    expect(response.body).toHaveProperty('user_id');
    expect(response.body).toHaveProperty('access_token');

    token = response.body.access_token;
  });

  it('should access protected route with valid token', () => {
    return request(app.getHttpServer())
      .get('/api/v1/user/1')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect((res) => {
        expect(res.body.username).toBe('wenguang');
      });
  });

  it('should reject invalid token', () => {
    return request(app.getHttpServer())
      .get('/api/v1/user/1')
      .set('Authorization', 'Bearer invalidtoken')
      .expect(401);
  });
});
