import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';

import { SearchSessionStore } from './search-session.store';

// Exercises the real Redis path: the compare-owner Lua commit, leases,
// per-owner LRU replacement, global eviction and score-based pruning. CI unit
// tests do not start Redis, so the suite only runs where OBB_REDIS_URL points
// at a reachable instance.
const redisUrl = process.env.OBB_REDIS_URL;
const describeRedis = redisUrl ? describe : describe.skip;

describeRedis('SearchSessionStore over Redis', () => {
  let env: string;
  let client: Redis;
  const stores: SearchSessionStore[] = [];

  const storeFor = (overrides: Record<string, string> = {}) => {
    const store = new SearchSessionStore(
      new ConfigService({
        ENV: env,
        OBB_REDIS_URL: redisUrl,
        ...overrides,
      }),
    );
    stores.push(store);
    return store;
  };
  const sessionKey = (owner: string, id: string) =>
    `${env}:search-snapshot:${owner}:${id}`;

  beforeEach(async () => {
    env = `session-test-${randomUUID()}`;
    client = new Redis(redisUrl!, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    client.on('error', () => undefined);
    await client.connect();
    await client.ping();
    stores.length = 0;
  });

  afterEach(async () => {
    for (const store of stores) store.onModuleDestroy();
    const keys = await client.keys(`${env}:search-snapshot:*`);
    if (keys.length) await client.del(...keys);
    client.disconnect();
  });

  it('round-trips a session between replicas through Redis', async () => {
    const first = storeFor();
    const second = storeFor();
    await first.exclusive('u', 's', (value, save) => {
      expect(value).toBeNull();
      return save({ cursor: 2 });
    });
    await second.exclusive('u', 's', (value) => {
      expect(value).toEqual({ cursor: 2 });
      return Promise.resolve();
    });
    const raw = await client.get(sessionKey('u', 's'));
    expect(raw && JSON.parse(raw)).toEqual({ cursor: 2 });
    expect(
      await client.zscore(`${env}:search-snapshot:all`, sessionKey('u', 's')),
    ).not.toBeNull();
  });

  it('holds an owner-scoped lease against a concurrent writer', async () => {
    const first = storeFor();
    const second = storeFor();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const holder = first.exclusive('u', 's', async (_, save) => {
      await save({ cursor: 1 });
      entered();
      await gate;
    });
    await started;
    await expect(
      second.exclusive('u', 's', () => Promise.resolve()),
    ).rejects.toMatchObject({ code: 'SEARCH_SESSION_BUSY', status: 409 });
    release();
    await holder;
    expect(await client.get(sessionKey('u', 's') + ':lock')).toBeNull();
  });

  it('fences a retired writer after per-owner LRU replacement', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1000);
    const store = storeFor();
    try {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let entered!: () => void;
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const retired = store.exclusive('u', 'old', async (_, save) => {
        await save({ cursor: 1 });
        entered();
        await gate;
        await save({ cursor: 999 });
      });
      await started;
      for (const [index, key] of ['two', 'three', 'four'].entries()) {
        now.mockReturnValue(2000 + index * 1000);
        await store.exclusive('u', key, (_, save) => save({ cursor: 2 }));
      }
      expect(await client.exists(sessionKey('u', 'old'))).toBe(0);
      release();
      await expect(retired).rejects.toMatchObject({
        code: 'SEARCH_SESSION_BUSY',
      });
      expect(
        await client.zscore(
          `${env}:search-snapshot:owner:u`,
          sessionKey('u', 'old'),
        ),
      ).toBeNull();
    } finally {
      now.mockRestore();
    }
  });

  it('evicts the globally oldest session instead of failing new owners', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1000);
    const store = storeFor({ OBB_SEARCH_SESSION_MAX_SESSIONS: '2' });
    try {
      for (const [index, owner] of ['first', 'second', 'third'].entries()) {
        now.mockReturnValue(1000 + index * 1000);
        await store.exclusive(owner, 's', (_, save) => save({ cursor: 1 }));
      }
      expect(await client.exists(sessionKey('first', 's'))).toBe(0);
      expect(await client.exists(sessionKey('second', 's'))).toBe(1);
      expect(await client.exists(sessionKey('third', 's'))).toBe(1);
      expect(await client.zcard(`${env}:search-snapshot:all`)).toBe(2);
      // Global eviction also removes the stale member of the owner's set.
      expect(await client.zcard(`${env}:search-snapshot:owner:first`)).toBe(0);
      await store.exclusive('second', 's', (value) => {
        expect(value).toEqual({ cursor: 1 });
        return Promise.resolve();
      });
    } finally {
      now.mockRestore();
    }
  });

  it('prunes sessions past their idle TTL before applying the global bound', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1000);
    const store = storeFor({ OBB_SEARCH_SESSION_MAX_SESSIONS: '2' });
    try {
      await store.exclusive('a', 's', (_, save) => save({ cursor: 1 }));
      await store.exclusive('b', 's', (_, save) => save({ cursor: 1 }));
      now.mockReturnValue(1000 + 121_000);
      await store.exclusive('c', 's', (_, save) => save({ cursor: 1 }));
      // Both expired scores were pruned, so nothing had to be evicted.
      expect(await client.zcard(`${env}:search-snapshot:all`)).toBe(1);
      const all = `${env}:search-snapshot:all`;
      expect(await client.zscore(all, sessionKey('a', 's'))).toBeNull();
      expect(await client.zscore(all, sessionKey('b', 's'))).toBeNull();
    } finally {
      now.mockRestore();
    }
  });

  it('keeps capacity failures for oversized sessions', async () => {
    const store = storeFor({ OBB_SEARCH_SESSION_MAX_BYTES: '64' });
    await expect(
      store.exclusive('u', 's', (_, save) => save({ text: 'x'.repeat(64) })),
    ).rejects.toMatchObject({ code: 'SEARCH_CAPACITY', status: 429 });
    expect(await client.exists(sessionKey('u', 's'))).toBe(0);
  });
});
