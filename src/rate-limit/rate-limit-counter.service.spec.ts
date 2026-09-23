import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { RateLimitCounter } from './rate-limit-counter.service';

const NAMESPACE = '/otp/ip-rate-limit-counts';
const WINDOW_MS = 60_000;

/** Bare-bones INCR/PEXPIRE/PTTL evaluator, enough for the guard's script. */
class FakeRedisClient {
  values = new Map<string, number>();
  expiresAt = new Map<string, number>();
  evalCalls = 0;
  now = Date.now();

  eval(
    script: string,
    options: { keys: string[]; arguments: string[] },
  ): Promise<[number, number]> {
    this.evalCalls++;
    expect(script).toContain('INCR');
    const [key] = options.keys;
    const windowMs = Number(options.arguments[0]);
    // The whole script runs without yielding, like Redis runs Lua.
    const count = (this.values.get(key) ?? 0) + 1;
    this.values.set(key, count);
    if (count === 1) {
      this.expiresAt.set(key, this.now + windowMs);
      return Promise.resolve([count, windowMs]);
    }
    const ttl = (this.expiresAt.get(key) ?? 0) - this.now;
    if (ttl < 0) {
      this.expiresAt.set(key, this.now + windowMs);
      return Promise.resolve([count, windowMs]);
    }
    return Promise.resolve([count, ttl]);
  }
}

const buildCounter = async (
  cacheManager: unknown,
): Promise<RateLimitCounter> => {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      RateLimitCounter,
      { provide: CACHE_MANAGER, useValue: cacheManager },
      { provide: ConfigService, useValue: { get: jest.fn(() => 'test') } },
    ],
  }).compile();
  return module.get(RateLimitCounter);
};

describe('RateLimitCounter', () => {
  describe('with a Redis-backed store', () => {
    let client: FakeRedisClient;
    let counter: RateLimitCounter;

    beforeEach(async () => {
      client = new FakeRedisClient();
      counter = await buildCounter({
        stores: [{ store: { getClient: () => Promise.resolve(client) } }],
      });
    });

    it('increments atomically and prefixes the key with the env', async () => {
      const first = await counter.hit(NAMESPACE, '1.2.3.4', WINDOW_MS);
      const second = await counter.hit(NAMESPACE, '1.2.3.4', WINDOW_MS);

      expect(first).toEqual({ count: 1, resetInMs: WINDOW_MS });
      expect(second.count).toBe(2);
      expect([...client.values.keys()]).toEqual([`/test${NAMESPACE}/1.2.3.4`]);
    });

    it('counts every hit of a parallel burst exactly once', async () => {
      const hits = await Promise.all(
        Array.from({ length: 50 }, () =>
          counter.hit(NAMESPACE, '1.2.3.4', WINDOW_MS),
        ),
      );

      expect(hits.map((h) => h.count).sort((a, b) => a - b)).toEqual(
        Array.from({ length: 50 }, (_, i) => i + 1),
      );
    });

    it('does not extend the window on later hits', async () => {
      await counter.hit(NAMESPACE, '1.2.3.4', WINDOW_MS);
      const key = `/test${NAMESPACE}/1.2.3.4`;
      const deadline = client.expiresAt.get(key);

      client.now += 20_000;
      const later = await counter.hit(NAMESPACE, '1.2.3.4', WINDOW_MS);

      expect(client.expiresAt.get(key)).toBe(deadline);
      expect(later.resetInMs).toBe(WINDOW_MS - 20_000);
    });

    it('resolves the client only once', async () => {
      const getClient = jest.fn(() => Promise.resolve(client));
      const cached = await buildCounter({ stores: [{ store: { getClient } }] });

      await cached.hit(NAMESPACE, '1.2.3.4', WINDOW_MS);
      await cached.hit(NAMESPACE, '1.2.3.4', WINDOW_MS);

      expect(getClient).toHaveBeenCalledTimes(1);
      expect(client.evalCalls).toBe(2);
    });

    it('propagates backend failures so the caller can fail open', async () => {
      const failing = await buildCounter({
        stores: [
          {
            store: {
              getClient: () =>
                Promise.resolve({
                  eval: () => Promise.reject(new Error('redis is down')),
                }),
            },
          },
        ],
      });

      await expect(
        failing.hit(NAMESPACE, '1.2.3.4', WINDOW_MS),
      ).rejects.toThrow('redis is down');
    });
  });

  describe('without a Redis client', () => {
    let store: Map<string, { count: number; resetAt: number }>;
    let counter: RateLimitCounter;

    beforeEach(async () => {
      store = new Map();
      counter = await buildCounter({
        stores: [{ store: {} }],
        get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
        set: jest.fn(
          (key: string, value: { count: number; resetAt: number }) => {
            store.set(key, { ...value });
            return Promise.resolve();
          },
        ),
      });
    });

    it('counts sequential hits in process', async () => {
      await counter.hit(NAMESPACE, '1.2.3.4', WINDOW_MS);
      const second = await counter.hit(NAMESPACE, '1.2.3.4', WINDOW_MS);

      expect(second.count).toBe(2);
      expect([...store.keys()]).toEqual([`/test${NAMESPACE}/1.2.3.4`]);
    });

    it('serialises a parallel burst instead of losing updates', async () => {
      const hits = await Promise.all(
        Array.from({ length: 25 }, () =>
          counter.hit(NAMESPACE, '1.2.3.4', WINDOW_MS),
        ),
      );

      expect(hits.map((h) => h.count)).toEqual(
        Array.from({ length: 25 }, (_, i) => i + 1),
      );
    });

    it('starts a new window once the old one expired', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(Date.parse('2026-01-01T00:00:00Z'));
      try {
        await counter.hit(NAMESPACE, '1.2.3.4', WINDOW_MS);
        jest.setSystemTime(Date.now() + WINDOW_MS + 1);

        const restarted = await counter.hit(NAMESPACE, '1.2.3.4', WINDOW_MS);

        expect(restarted).toEqual({ count: 1, resetInMs: WINDOW_MS });
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
