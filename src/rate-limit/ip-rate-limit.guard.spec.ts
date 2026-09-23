import { ExecutionContext, HttpStatus } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { I18nService } from 'nestjs-i18n';
import { CacheService } from 'omniboxd/common/cache.service';

import { IpRateLimitGuard } from './ip-rate-limit.guard';
import { IP_RATE_LIMIT_NAMESPACE } from './rate-limit.constants';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

describe('IpRateLimitGuard', () => {
  let guard: IpRateLimitGuard;
  let reflector: jest.Mocked<Reflector>;
  let store: Map<string, RateLimitRecord>;
  let ttls: Map<string, number | undefined>;

  const MAX = 3;
  const WINDOW_MS = 60_000;

  const createContext = (
    headers: Record<string, string | string[]> = {},
    extra: { ip?: string; remoteAddress?: string } = {},
  ): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          headers,
          ip: extra.ip,
          socket: { remoteAddress: extra.remoteAddress },
        }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(async () => {
    store = new Map();
    ttls = new Map();
    const config: Record<string, string> = {
      OBB_OTP_IP_RATE_LIMIT_MAX: String(MAX),
      OBB_OTP_IP_RATE_LIMIT_WINDOW_MS: String(WINDOW_MS),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IpRateLimitGuard,
        {
          provide: Reflector,
          useValue: { getAllAndOverride: jest.fn().mockReturnValue(true) },
        },
        {
          provide: CacheService,
          useValue: {
            get: jest.fn((ns: string, key: string) =>
              Promise.resolve(store.get(`${ns}/${key}`) ?? null),
            ),
            set: jest.fn(
              (
                ns: string,
                key: string,
                value: RateLimitRecord,
                ttl?: number,
              ) => {
                store.set(`${ns}/${key}`, { ...value });
                ttls.set(`${ns}/${key}`, ttl);
                return Promise.resolve();
              },
            ),
            delete: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn((key: string) => config[key]) },
        },
        {
          provide: I18nService,
          useValue: {
            t: jest.fn(
              (key: string, options?: { args?: { minutes?: number } }) =>
                `${key}:${options?.args?.minutes}`,
            ),
          },
        },
      ],
    }).compile();

    guard = module.get(IpRateLimitGuard);
    reflector = module.get(Reflector);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('allows the request when the handler is not rate limited', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);

    await expect(guard.canActivate(createContext({}))).resolves.toBe(true);
    expect(store.size).toBe(0);
  });

  it('passes while under the limit and counts every request', async () => {
    const ctx = createContext({ 'x-forwarded-for': '1.2.3.4' });

    for (let i = 0; i < MAX; i++) {
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    }

    expect(store.get(`${IP_RATE_LIMIT_NAMESPACE}/1.2.3.4`)).toEqual({
      count: MAX,
      resetAt: expect.any(Number),
    });
  });

  it('throws 429 with the remaining minutes once the limit is reached', async () => {
    const ctx = createContext({ 'x-forwarded-for': '1.2.3.4' });
    for (let i = 0; i < MAX; i++) {
      await guard.canActivate(ctx);
    }

    const error = await guard.canActivate(ctx).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(
      HttpStatus.TOO_MANY_REQUESTS,
    );
    expect((error as HttpException).getResponse()).toBe(
      'rateLimit.errors.tooManyRequests:1',
    );
  });

  it('resets the window after it expires', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(Date.parse('2026-01-01T00:00:00Z'));
    const ctx = createContext({ 'x-forwarded-for': '1.2.3.4' });

    for (let i = 0; i < MAX; i++) {
      await guard.canActivate(ctx);
    }
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(HttpException);

    jest.setSystemTime(Date.now() + WINDOW_MS + 1);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(store.get(`${IP_RATE_LIMIT_NAMESPACE}/1.2.3.4`)?.count).toBe(1);
  });

  it('uses the first hop of a multi-hop x-forwarded-for', async () => {
    await guard.canActivate(
      createContext({ 'x-forwarded-for': ' 9.9.9.9 , 10.0.0.1, 10.0.0.2 ' }),
    );

    expect([...store.keys()]).toEqual([`${IP_RATE_LIMIT_NAMESPACE}/9.9.9.9`]);
  });

  it('falls back to x-real-ip, then request.ip, then the socket address', async () => {
    await guard.canActivate(createContext({ 'x-real-ip': '8.8.8.8' }));
    await guard.canActivate(createContext({}, { ip: '7.7.7.7' }));
    await guard.canActivate(createContext({}, { remoteAddress: '6.6.6.6' }));

    expect([...store.keys()]).toEqual([
      `${IP_RATE_LIMIT_NAMESPACE}/8.8.8.8`,
      `${IP_RATE_LIMIT_NAMESPACE}/7.7.7.7`,
      `${IP_RATE_LIMIT_NAMESPACE}/6.6.6.6`,
    ]);
  });

  it('normalises IPv4-mapped IPv6 addresses to the same bucket', async () => {
    await guard.canActivate(
      createContext({ 'x-forwarded-for': '::ffff:1.2.3.4' }),
    );
    await guard.canActivate(createContext({ 'x-forwarded-for': '1.2.3.4' }));

    expect([...store.keys()]).toEqual([`${IP_RATE_LIMIT_NAMESPACE}/1.2.3.4`]);
    expect(store.get(`${IP_RATE_LIMIT_NAMESPACE}/1.2.3.4`)?.count).toBe(2);
  });

  it('keeps separate buckets per IP', async () => {
    const a = createContext({ 'x-forwarded-for': '1.1.1.1' });
    const b = createContext({ 'x-forwarded-for': '2.2.2.2' });
    for (let i = 0; i < MAX; i++) {
      await guard.canActivate(a);
    }

    await expect(guard.canActivate(a)).rejects.toBeInstanceOf(HttpException);
    await expect(guard.canActivate(b)).resolves.toBe(true);
  });

  it('allows the request when no IP can be determined', async () => {
    await expect(guard.canActivate(createContext({}))).resolves.toBe(true);
    expect(store.size).toBe(0);
  });

  it('sets the cache TTL to the remaining window', async () => {
    const ctx = createContext({ 'x-forwarded-for': '1.2.3.4' });
    await guard.canActivate(ctx);

    expect(ttls.get(`${IP_RATE_LIMIT_NAMESPACE}/1.2.3.4`)).toBe(WINDOW_MS);
  });

  it('falls back to the defaults when the env values are unusable', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IpRateLimitGuard,
        { provide: Reflector, useValue: { getAllAndOverride: jest.fn() } },
        {
          provide: CacheService,
          useValue: { get: jest.fn(), set: jest.fn(), delete: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn(() => 'not-a-number') },
        },
        { provide: I18nService, useValue: { t: jest.fn() } },
      ],
    }).compile();
    const fallbackGuard = module.get(IpRateLimitGuard);

    expect(fallbackGuard).toHaveProperty('max', 15);
    expect(fallbackGuard).toHaveProperty('windowMs', 900000);
  });
});
