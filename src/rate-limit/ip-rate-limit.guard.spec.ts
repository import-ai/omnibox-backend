import { ExecutionContext, HttpStatus } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { I18nService } from 'nestjs-i18n';

import { IpRateLimitGuard } from './ip-rate-limit.guard';
import { IP_RATE_LIMIT_NAMESPACE } from './rate-limit.constants';
import { RateLimitCounter, RateLimitHit } from './rate-limit-counter.service';

describe('IpRateLimitGuard', () => {
  let guard: IpRateLimitGuard;
  let reflector: jest.Mocked<Reflector>;
  /** Counts per full key, incremented synchronously - i.e. atomically. */
  let counts: Map<string, number>;
  let windows: Map<string, number>;
  let counter: { hit: jest.Mock };

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

  const buildGuard = async (
    overrides: {
      config?: Record<string, string>;
      counterHit?: jest.Mock;
    } = {},
  ): Promise<IpRateLimitGuard> => {
    const config: Record<string, string> = overrides.config ?? {
      OBB_OTP_IP_RATE_LIMIT_MAX: String(MAX),
      OBB_OTP_IP_RATE_LIMIT_WINDOW_MS: String(WINDOW_MS),
    };
    counter = { hit: overrides.counterHit ?? defaultHit() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IpRateLimitGuard,
        {
          provide: Reflector,
          useValue: { getAllAndOverride: jest.fn().mockReturnValue(true) },
        },
        { provide: RateLimitCounter, useValue: counter },
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

    reflector = module.get(Reflector);
    return module.get(IpRateLimitGuard);
  };

  const defaultHit = (): jest.Mock =>
    jest.fn(
      (
        namespace: string,
        key: string,
        windowMs: number,
      ): Promise<RateLimitHit> => {
        const full = `${namespace}/${key}`;
        const count = (counts.get(full) ?? 0) + 1;
        counts.set(full, count);
        if (!windows.has(full)) {
          windows.set(full, windowMs);
        }
        return Promise.resolve({
          count,
          resetInMs: windows.get(full) ?? windowMs,
        });
      },
    );

  beforeEach(async () => {
    counts = new Map();
    windows = new Map();
    guard = await buildGuard();
  });

  it('allows the request when the handler is not rate limited', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);

    await expect(guard.canActivate(createContext({}))).resolves.toBe(true);
    expect(counter.hit).not.toHaveBeenCalled();
  });

  it('passes while under the limit and counts every request', async () => {
    const ctx = createContext({ 'x-real-ip': '1.2.3.4' });

    for (let i = 0; i < MAX; i++) {
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    }

    expect(counts.get(`${IP_RATE_LIMIT_NAMESPACE}/1.2.3.4`)).toBe(MAX);
  });

  it('throws 429 with the remaining minutes once the limit is reached', async () => {
    const ctx = createContext({ 'x-real-ip': '1.2.3.4' });
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

  it('reports the minutes left in the window, not the whole window', async () => {
    const hit = jest
      .fn()
      .mockResolvedValue({ count: MAX + 1, resetInMs: 5 * 60_000 });
    const limited = await buildGuard({ counterHit: hit });

    const error = await limited
      .canActivate(createContext({ 'x-real-ip': '1.2.3.4' }))
      .catch((e: unknown) => e);

    expect((error as HttpException).getResponse()).toBe(
      'rateLimit.errors.tooManyRequests:5',
    );
  });

  it('lets exactly max concurrent requests from one IP through', async () => {
    const ctx = createContext({ 'x-real-ip': '1.2.3.4' });
    const attempts = MAX * 5;

    const results = await Promise.all(
      Array.from({ length: attempts }, () =>
        guard.canActivate(ctx).then(
          () => 'allowed' as const,
          (error: unknown) =>
            error instanceof HttpException &&
            error.getStatus() === (HttpStatus.TOO_MANY_REQUESTS as number)
              ? ('limited' as const)
              : ('error' as const),
        ),
      ),
    );

    expect(results.filter((r) => r === 'allowed')).toHaveLength(MAX);
    expect(results.filter((r) => r === 'limited')).toHaveLength(attempts - MAX);
    expect(results.filter((r) => r === 'error')).toHaveLength(0);
  });

  it('ignores an attacker-supplied x-forwarded-for when x-real-ip is present', async () => {
    // The gateway appends the real peer to whatever the client sent, so a
    // client-controlled first hop must not be able to mint a fresh bucket.
    for (let i = 0; i < MAX; i++) {
      await expect(
        guard.canActivate(
          createContext({
            'x-forwarded-for': `1.2.3.${i}`,
            'x-real-ip': '203.0.113.7',
          }),
        ),
      ).resolves.toBe(true);
    }

    await expect(
      guard.canActivate(
        createContext({
          'x-forwarded-for': '1.2.3.99',
          'x-real-ip': '203.0.113.7',
        }),
      ),
    ).rejects.toBeInstanceOf(HttpException);
    expect([...counts.keys()]).toEqual([
      `${IP_RATE_LIMIT_NAMESPACE}/203.0.113.7`,
    ]);
  });

  it('uses the last hop of a multi-hop x-forwarded-for', async () => {
    await guard.canActivate(
      createContext({ 'x-forwarded-for': ' 9.9.9.9 , 10.0.0.1, 10.0.0.2 ' }),
    );

    expect([...counts.keys()]).toEqual([`${IP_RATE_LIMIT_NAMESPACE}/10.0.0.2`]);
  });

  it('prefers x-real-ip over x-forwarded-for, then request.ip, then the socket', async () => {
    await guard.canActivate(
      createContext({ 'x-real-ip': '8.8.8.8', 'x-forwarded-for': '9.9.9.9' }),
    );
    await guard.canActivate(createContext({ 'x-forwarded-for': '9.9.9.9' }));
    await guard.canActivate(createContext({}, { ip: '7.7.7.7' }));
    await guard.canActivate(createContext({}, { remoteAddress: '6.6.6.6' }));

    expect([...counts.keys()]).toEqual([
      `${IP_RATE_LIMIT_NAMESPACE}/8.8.8.8`,
      `${IP_RATE_LIMIT_NAMESPACE}/9.9.9.9`,
      `${IP_RATE_LIMIT_NAMESPACE}/7.7.7.7`,
      `${IP_RATE_LIMIT_NAMESPACE}/6.6.6.6`,
    ]);
  });

  it('takes the last value of a repeated x-real-ip header', async () => {
    await guard.canActivate(
      createContext({ 'x-real-ip': ['1.1.1.1', '203.0.113.7'] }),
    );

    expect([...counts.keys()]).toEqual([
      `${IP_RATE_LIMIT_NAMESPACE}/203.0.113.7`,
    ]);
  });

  it('normalises IPv4-mapped IPv6 addresses to the same bucket', async () => {
    await guard.canActivate(createContext({ 'x-real-ip': '::ffff:1.2.3.4' }));
    await guard.canActivate(createContext({ 'x-real-ip': '1.2.3.4' }));

    expect([...counts.keys()]).toEqual([`${IP_RATE_LIMIT_NAMESPACE}/1.2.3.4`]);
    expect(counts.get(`${IP_RATE_LIMIT_NAMESPACE}/1.2.3.4`)).toBe(2);
  });

  it('keeps separate buckets per IP', async () => {
    const a = createContext({ 'x-real-ip': '1.1.1.1' });
    const b = createContext({ 'x-real-ip': '2.2.2.2' });
    for (let i = 0; i < MAX; i++) {
      await guard.canActivate(a);
    }

    await expect(guard.canActivate(a)).rejects.toBeInstanceOf(HttpException);
    await expect(guard.canActivate(b)).resolves.toBe(true);
  });

  it('allows the request when no IP can be determined', async () => {
    await expect(guard.canActivate(createContext({}))).resolves.toBe(true);
    expect(counter.hit).not.toHaveBeenCalled();
  });

  it('asks the counter for a window of the configured length', async () => {
    await guard.canActivate(createContext({ 'x-real-ip': '1.2.3.4' }));

    expect(counter.hit).toHaveBeenCalledWith(
      IP_RATE_LIMIT_NAMESPACE,
      '1.2.3.4',
      WINDOW_MS,
    );
  });

  it('allows the request when the counter backend fails', async () => {
    const hit = jest.fn().mockRejectedValue(new Error('redis is down'));
    const degraded = await buildGuard({ counterHit: hit });

    await expect(
      degraded.canActivate(createContext({ 'x-real-ip': '1.2.3.4' })),
    ).resolves.toBe(true);
  });

  it('falls back to the defaults when the env values are unusable', async () => {
    const fallbackGuard = await buildGuard({
      config: {
        OBB_OTP_IP_RATE_LIMIT_MAX: 'not-a-number',
        OBB_OTP_IP_RATE_LIMIT_WINDOW_MS: 'not-a-number',
      },
    });

    expect(fallbackGuard).toHaveProperty('max', 15);
    expect(fallbackGuard).toHaveProperty('windowMs', 900000);
  });
});
