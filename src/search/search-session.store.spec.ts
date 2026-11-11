import { ConfigService } from '@nestjs/config';

import { SearchSessionStore } from './search-session.store';

it('expires old sessions without confusing them with an empty snapshot', async () => {
  const now = jest.spyOn(Date, 'now').mockReturnValue(1000);
  const store = new SearchSessionStore(
    new ConfigService({ ENV: 'test', OBB_REDIS_URL: '' }),
  );
  try {
    await store.exclusive('u', 's', (_, save) => save({ cursor: 1 }));
    now.mockReturnValue(122000);
    await store.exclusive('u', 's', (value) => {
      expect(value).toBeNull();
      return Promise.resolve();
    });
  } finally {
    now.mockRestore();
    store.onModuleDestroy();
  }
});

it('fences a retired writer when per-owner capacity replaces its session', async () => {
  const store = new SearchSessionStore(
    new ConfigService({ ENV: 'test', OBB_REDIS_URL: '' }),
  );
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const start = new Promise<void>((r) => {
    entered = r;
  });
  const retired = store.exclusive('u', 'old', async (_, save) => {
    await save({ cursor: 1 });
    entered();
    await gate;
    await save({ cursor: 999 });
  });
  await start;
  for (const key of ['two', 'three', 'four'])
    await store.exclusive('u', key, (_, save) => save({ cursor: 2 }));
  release();
  await expect(retired).rejects.toMatchObject({ code: 'SEARCH_SESSION_BUSY' });
  await store.exclusive('u', 'old', (value) => {
    expect(value).toBeNull();
    return Promise.resolve();
  });
});

it('bounds snapshot and replay state size', async () => {
  const store = new SearchSessionStore(
    new ConfigService({ ENV: 'test', OBB_REDIS_URL: '' }),
  );
  await expect(
    store.exclusive('u', 's', (_, save) =>
      save({ text: 'x'.repeat(2 * 1024 * 1024) }),
    ),
  ).rejects.toMatchObject({ code: 'SEARCH_CAPACITY' });
});

it('requires explicit local memory and never permits production fallback', () => {
  expect(
    () =>
      new SearchSessionStore(
        new ConfigService({
          ENV: 'local',
          NODE_ENV: 'development',
          OBB_REDIS_URL: '',
        }),
      ),
  ).toThrow('SEARCH_REDIS_REQUIRED');
  expect(
    () =>
      new SearchSessionStore(
        new ConfigService({
          ENV: 'prod',
          NODE_ENV: 'production',
          OBB_REDIS_URL: '',
          OBB_SEARCH_SESSION_MEMORY: true,
        }),
      ),
  ).toThrow('SEARCH_REDIS_REQUIRED');
});
