import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { I18nService } from 'nestjs-i18n';
import { UserService } from 'omniboxd/user/user.service';
import { createClient } from 'redis';
import * as request from 'supertest';
import { GenericContainer } from 'testcontainers';

import { AuthService } from '../auth.service';
import { DesktopAuthController } from './desktop-auth.controller';
import { DesktopAuthService, desktopDigest } from './desktop-auth.service';

jest.mock('../auth.service', () => ({ AuthService: class {} }));
jest.mock('omniboxd/user/user.service', () => ({ UserService: class {} }));

it('requires bearer confirmation, S256 proof, expiry and atomic one-time exchange over HTTP', async () => {
  const container = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .start();
  const url = `redis://${container.getHost()}:${container.getMappedPort(6379)}`;
  const config = {
    OBB_REDIS_URL: url,
    OBB_BASE_URL: 'http://test',
    OBB_DESKTOP_AUTH_SCHEME: 'omnibox-auth-test',
  };
  const module = await Test.createTestingModule({
    controllers: [DesktopAuthController],
    providers: [
      DesktopAuthService,
      {
        provide: ConfigService,
        useValue: { get: (key: keyof typeof config) => config[key] },
      },
      { provide: I18nService, useValue: { t: () => 'Invalid desktop login' } },
      {
        provide: AuthService,
        useValue: {
          jwtVerify: (token: string) => {
            if (token !== 'valid') throw new Error('Invalid token');
            return { sub: 'user' };
          },
          login: (user: { id: string }) => ({
            id: user.id,
            access_token: 'jwt',
          }),
        },
      },
      {
        provide: UserService,
        useValue: {
          find: (id: string) => Promise.resolve(id === 'user' ? { id } : null),
        },
      },
    ],
  }).compile();
  const app = module.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  // Keep the server open until all concurrent exchanges finish.
  await app.listen(0, '127.0.0.1');
  const redis = createClient({ url });
  await redis.connect();
  const api = request(app.getHttpServer());
  const verifier = 'a'.repeat(43);
  const startBody = {
    code_challenge: desktopDigest(verifier),
    state: 's'.repeat(43),
    client_id: 'omnibox-auth-test',
  };
  const start = async () =>
    (await api.post('/api/v1/desktop-auth/start').send(startBody).expect(201))
      .body.transaction;
  try {
    await api
      .post('/api/v1/desktop-auth/start')
      .send({ ...startBody, code_challenge: 'short' })
      .expect(400);
    await api
      .post('/api/v1/desktop-auth/start')
      .send({ ...startBody, client_id: 'omnibox-auth-prod' })
      .expect(400);
    const transaction = await start();
    await api
      .post('/api/v1/desktop-auth/authorize')
      .set('Cookie', 'token=valid')
      .send({ transaction, user_id: 'user' })
      .expect(401);
    await api
      .post('/api/v1/desktop-auth/authorize')
      .set('Authorization', 'Bearer valid')
      .send({ transaction, user_id: 'another-user' })
      .expect(401);
    await api
      .post('/api/v1/desktop-auth/exchange')
      .send({ transaction, code: 'b'.repeat(64), code_verifier: verifier })
      .expect(400);
    const authorized = await api
      .post('/api/v1/desktop-auth/authorize')
      .set('Authorization', 'Bearer valid')
      .send({ transaction, user_id: 'user' })
      .expect(201);
    const callback = new URL(authorized.body.callback_url);
    expect(callback.protocol).toBe('omnibox-auth-test:');
    expect(callback.searchParams.get('state')).toBe(startBody.state);
    await api
      .post('/api/v1/desktop-auth/authorize')
      .set('Authorization', 'Bearer valid')
      .send({ transaction, user_id: 'user' })
      .expect(400);
    const exchange = {
      transaction,
      code: callback.searchParams.get('code'),
      code_verifier: verifier,
    };
    await api
      .post('/api/v1/desktop-auth/exchange')
      .send({ ...exchange, code_verifier: 'b'.repeat(43) })
      .expect(400);
    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        api.post('/api/v1/desktop-auth/exchange').send(exchange),
      ),
    );
    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    expect(responses.filter((r) => r.status === 400)).toHaveLength(7);
    expect(responses.find((r) => r.status === 201)?.body).toEqual({
      id: 'user',
      access_token: 'jwt',
    });
    const confirmedExpired = await start();
    const expiredResponse = await api
      .post('/api/v1/desktop-auth/authorize')
      .set('Authorization', 'Bearer valid')
      .send({ transaction: confirmedExpired, user_id: 'user' })
      .expect(201);
    const expiredCode = new URL(
      expiredResponse.body.callback_url,
    ).searchParams.get('code');
    await redis.pExpire(`desktop-auth:http://test:${confirmedExpired}`, 1);
    await new Promise((resolve) => setTimeout(resolve, 10));
    await api
      .post('/api/v1/desktop-auth/exchange')
      .send({
        transaction: confirmedExpired,
        code: expiredCode,
        code_verifier: verifier,
      })
      .expect(400);
    const expired = await start();
    await redis.pExpire(`desktop-auth:http://test:${expired}`, 1);
    await new Promise((resolve) => setTimeout(resolve, 10));
    await api
      .post('/api/v1/desktop-auth/authorize')
      .set('Authorization', 'Bearer valid')
      .send({ transaction: expired, user_id: 'user' })
      .expect(400);
  } finally {
    await redis.disconnect();
    await app.close();
    await container.stop();
  }
}, 120_000);
