import KeyvRedis from '@keyv/redis';
import { ConfigService } from '@nestjs/config';
import { createCache } from 'cache-manager';
import { Keyv } from 'keyv';
import { GenericContainer, StartedTestContainer } from 'testcontainers';

import { AtomicMemoryCache, CacheService } from './cache.service';

const config = new ConfigService({ ENV: 'cache-consume-test' });
const createService = (store: Keyv) =>
  new CacheService(createCache({ stores: [store] }), config);

async function verifyConsumption(first: CacheService, second = first) {
  await first.set('/codes', 'code', { userId: 'test' }, 60_000);
  expect(await second.get('/codes', 'code')).toEqual({ userId: 'test' });
  const results = await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      (index % 2 ? first : second).consume('/codes', 'code'),
    ),
  );
  expect(results.filter(Boolean)).toHaveLength(1);
  expect(await second.consume('/codes', 'code')).toBe(false);
  await first.set('/codes', 'expired', 'value', 10);
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(await second.consume('/codes', 'expired')).toBe(false);
}

it('atomically consumes memory entries and rejects failed deletions', async () => {
  const store = new Keyv({ store: new AtomicMemoryCache() });
  const service = createService(store);
  await verifyConsumption(service);
  jest.spyOn(store, 'delete').mockRejectedValueOnce(new Error('Unavailable'));
  await expect(service.consume('/codes', 'code')).rejects.toThrow(
    'Unavailable',
  );
});

describe('shared Redis consumption', () => {
  let container: StartedTestContainer;
  const stores: Keyv[] = [];
  beforeAll(async () => {
    container = await new GenericContainer('redis:7-alpine')
      .withExposedPorts(6379)
      .start();
    const url = `redis://${container.getHost()}:${container.getMappedPort(6379)}`;
    stores.push(
      new Keyv({ store: new KeyvRedis(url) }),
      new Keyv({ store: new KeyvRedis(url) }),
    );
  });
  afterAll(async () => {
    await Promise.all(stores.map((store) => store.disconnect()));
    await container?.stop();
  });
  it('allows only one winner across independent Redis connections', async () => {
    await verifyConsumption(createService(stores[0]), createService(stores[1]));
  });
});
