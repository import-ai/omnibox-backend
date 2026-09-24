import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import {
  getOptionsToken,
  getStorageToken,
  ThrottlerModuleOptions,
  ThrottlerOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { I18nService } from 'nestjs-i18n';

import { OtpThrottlerGuard } from './otp-throttler.guard';

const MAX = 3;
const WINDOW_MS = 60_000;

/**
 * Minimal `ThrottlerStorage`: counts per key, blocks for `blockDuration` once
 * the limit is exceeded, reports remaining times in seconds like the real
 * memory and Redis storages do.
 */
class FakeStorage implements ThrottlerStorage {
  hits = new Map<string, number>();
  calls: Array<{
    key: string;
    ttl: number;
    limit: number;
    blockDuration: number;
    name: string;
  }> = [];

  increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    name: string,
  ): Promise<ThrottlerStorageRecord> {
    this.calls.push({ key, ttl, limit, blockDuration, name });
    const totalHits = (this.hits.get(key) ?? 0) + 1;
    this.hits.set(key, totalHits);
    const isBlocked = totalHits > limit;
    return Promise.resolve({
      totalHits,
      timeToExpire: Math.ceil(ttl / 1000),
      isBlocked,
      timeToBlockExpire: isBlocked ? Math.ceil(blockDuration / 1000) : 0,
    });
  }
}

const OTP_THROTTLER: ThrottlerOptions = {
  name: 'otp',
  limit: MAX,
  ttl: WINDOW_MS,
};

describe('OtpThrottlerGuard', () => {
  let guard: OtpThrottlerGuard;
  let storage: FakeStorage;

  const createContext = (
    headers: Record<string, string | string[]> = {},
    extra: { ip?: string; remoteAddress?: string; handler?: string } = {},
  ): ExecutionContext => {
    const handler = { [extra.handler ?? 'sendOtp']: () => undefined };
    return {
      getHandler: () => handler[extra.handler ?? 'sendOtp'],
      getClass: () => class AuthController {},
      switchToHttp: () => ({
        getRequest: () => ({
          headers,
          ip: extra.ip,
          socket: { remoteAddress: extra.remoteAddress },
        }),
        getResponse: () => ({ header: jest.fn() }),
      }),
    } as unknown as ExecutionContext;
  };

  const buildGuard = async (
    overrides: {
      options?: ThrottlerModuleOptions;
      config?: Record<string, string>;
      storage?: ThrottlerStorage;
    } = {},
  ): Promise<OtpThrottlerGuard> => {
    const config: Record<string, string> = overrides.config ?? {
      OBB_OTP_IP_RATE_LIMIT_MAX: String(MAX),
      OBB_OTP_IP_RATE_LIMIT_WINDOW_MS: String(WINDOW_MS),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OtpThrottlerGuard,
        Reflector,
        {
          provide: getOptionsToken(),
          useValue: overrides.options ?? { throttlers: [OTP_THROTTLER] },
        },
        { provide: getStorageToken(), useValue: overrides.storage ?? storage },
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

    const built = module.get(OtpThrottlerGuard);
    await built.onModuleInit();
    return built;
  };

  const activeThrottlers = (target: OtpThrottlerGuard): ThrottlerOptions[] =>
    (target as unknown as { throttlers: ThrottlerOptions[] }).throttlers;

  beforeEach(async () => {
    storage = new FakeStorage();
    guard = await buildGuard();
  });

  it('passes while under the limit and counts every request', async () => {
    const ctx = createContext({ 'x-forwarded-for': '1.2.3.4' });

    for (let i = 0; i < MAX; i++) {
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    }

    expect(storage.hits.get('otp:1.2.3.4')).toBe(MAX);
  });

  it('asks the storage for the configured window and limit', async () => {
    await guard.canActivate(createContext({ 'x-forwarded-for': '1.2.3.4' }));

    expect(storage.calls).toEqual([
      {
        key: 'otp:1.2.3.4',
        ttl: WINDOW_MS,
        limit: MAX,
        blockDuration: WINDOW_MS,
        name: 'otp',
      },
    ]);
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

  it('reports the block duration in whole minutes', async () => {
    const fiveMinutes = await buildGuard({
      options: { throttlers: [{ ...OTP_THROTTLER, ttl: 5 * 60_000 }] },
    });
    const ctx = createContext({ 'x-forwarded-for': '1.2.3.4' });
    for (let i = 0; i < MAX; i++) {
      await fiveMinutes.canActivate(ctx);
    }

    const error = await fiveMinutes.canActivate(ctx).catch((e: unknown) => e);

    expect((error as HttpException).getResponse()).toBe(
      'rateLimit.errors.tooManyRequests:5',
    );
  });

  it('uses the FIRST hop of x-forwarded-for, not x-real-ip or later hops', async () => {
    // Both nginx hops overwrite x-real-ip and append to x-forwarded-for, so
    // only the first element still carries the client address.
    await guard.canActivate(
      createContext({
        'x-forwarded-for': ' 9.9.9.9 , 10.0.0.1, 10.0.0.2 ',
        'x-real-ip': '10.0.0.2',
      }),
    );

    expect([...storage.hits.keys()]).toEqual(['otp:9.9.9.9']);
  });

  it('takes the first value of a repeated x-forwarded-for header', async () => {
    await guard.canActivate(
      createContext({ 'x-forwarded-for': ['9.9.9.9', '10.0.0.1'] }),
    );

    expect([...storage.hits.keys()]).toEqual(['otp:9.9.9.9']);
  });

  it('falls back through x-real-ip, request.ip and the socket', async () => {
    await guard.canActivate(createContext({ 'x-real-ip': '8.8.8.8' }));
    await guard.canActivate(createContext({}, { ip: '7.7.7.7' }));
    await guard.canActivate(createContext({}, { remoteAddress: '6.6.6.6' }));

    expect([...storage.hits.keys()]).toEqual([
      'otp:8.8.8.8',
      'otp:7.7.7.7',
      'otp:6.6.6.6',
    ]);
  });

  it('skips candidates that are not a well-formed IP', async () => {
    await guard.canActivate(
      createContext({ 'x-forwarded-for': 'unknown', 'x-real-ip': '8.8.8.8' }),
    );
    await guard.canActivate(
      createContext(
        { 'x-forwarded-for': '', 'x-real-ip': 'not-an-ip' },
        { ip: '7.7.7.7' },
      ),
    );

    expect([...storage.hits.keys()]).toEqual(['otp:8.8.8.8', 'otp:7.7.7.7']);
  });

  it('normalises IPv4-mapped IPv6 addresses to the same bucket', async () => {
    await guard.canActivate(
      createContext({ 'x-forwarded-for': '::ffff:1.2.3.4' }),
    );
    await guard.canActivate(createContext({ 'x-forwarded-for': '1.2.3.4' }));

    expect([...storage.hits.keys()]).toEqual(['otp:1.2.3.4']);
    expect(storage.hits.get('otp:1.2.3.4')).toBe(2);
  });

  it('keeps IPv6 addresses as they are', async () => {
    await guard.canActivate(
      createContext({ 'x-forwarded-for': '2001:db8::1' }),
    );

    expect([...storage.hits.keys()]).toEqual(['otp:2001:db8::1']);
  });

  it('shares one bucket per IP across handlers', async () => {
    await guard.canActivate(
      createContext({ 'x-forwarded-for': '1.2.3.4' }, { handler: 'sendOtp' }),
    );
    await guard.canActivate(
      createContext(
        { 'x-forwarded-for': '1.2.3.4' },
        { handler: 'validateEmail' },
      ),
    );

    expect([...storage.hits.keys()]).toEqual(['otp:1.2.3.4']);
    expect(storage.hits.get('otp:1.2.3.4')).toBe(2);
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
    expect(storage.calls).toHaveLength(0);
  });

  it('allows the request when the storage fails', async () => {
    const degraded = await buildGuard({
      storage: {
        increment: jest.fn().mockRejectedValue(new Error('redis is down')),
      },
    });

    await expect(
      degraded.canActivate(createContext({ 'x-forwarded-for': '1.2.3.4' })),
    ).resolves.toBe(true);
  });

  it('applies only the otp throttler when others are configured', async () => {
    const shared = await buildGuard({
      options: {
        throttlers: [
          { name: 'query', ttl: 1000, limit: 2 },
          { name: 'create', ttl: 60_000, limit: 5 },
          OTP_THROTTLER,
        ],
      },
    });

    expect(activeThrottlers(shared)).toEqual([OTP_THROTTLER]);

    await shared.canActivate(createContext({ 'x-forwarded-for': '1.2.3.4' }));

    expect(storage.calls.map((call) => call.name)).toEqual(['otp']);
  });

  it('falls back to the env-derived otp throttler when none is configured', async () => {
    const fallback = await buildGuard({
      options: { throttlers: [{ name: 'query', ttl: 1000, limit: 2 }] },
    });

    expect(activeThrottlers(fallback)).toEqual([OTP_THROTTLER]);
  });

  it('falls back to the defaults when the env values are unusable', async () => {
    const fallback = await buildGuard({
      options: { throttlers: [] },
      config: {
        OBB_OTP_IP_RATE_LIMIT_MAX: 'not-a-number',
        OBB_OTP_IP_RATE_LIMIT_WINDOW_MS: 'not-a-number',
      },
    });

    expect(activeThrottlers(fallback)).toEqual([
      { name: 'otp', limit: 15, ttl: 900000 },
    ]);
  });
});
