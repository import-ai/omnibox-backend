import { Controller, Get, INestApplication, Injectable } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PassportModule, PassportStrategy } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { JwtAuthGuard } from 'omniboxd/auth/jwt-auth.guard';
import { WizardAPIService } from 'omniboxd/wizard-api/wizard-api.service';
import { ExtractJwt, Strategy } from 'passport-jwt';
import * as request from 'supertest';

import { AppConfigController } from './app-config.controller';

const secret = 'config-access-test-secret';

@Injectable()
class TestJwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: secret,
    });
  }

  validate(payload: { sub: string }) {
    return { id: payload.sub };
  }
}

@Controller('api/v1/config-access-test')
class ProtectedController {
  @Get()
  getProtected() {
    return { protected: true };
  }
}

describe('public config access', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
      controllers: [AppConfigController, ProtectedController],
      providers: [
        TestJwtStrategy,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: WizardAPIService, useValue: {} },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns only public deployment flags without authentication', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/config')
      .expect(200)
      .expect({ commercial: false });
  });

  it('keeps public config available with a stale credential', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/config')
      .set('Authorization', 'Bearer invalid-token')
      .expect(200)
      .expect({ commercial: false });
  });

  it('keeps unrelated routes protected without a valid token', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/config-access-test')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/config-access-test')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);
  });

  it('preserves authenticated access to public and protected routes', async () => {
    const token = new JwtService({ secret }).sign({ sub: 'test-user' });
    await request(app.getHttpServer())
      .get('/api/v1/config')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect({ commercial: false });
    await request(app.getHttpServer())
      .get('/api/v1/config-access-test')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect({ protected: true });
  });
});
