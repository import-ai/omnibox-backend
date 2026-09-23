import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface RateLimitHit {
  /** Number of requests recorded in the current window, including this one. */
  count: number;
  /** Milliseconds until the current window expires. */
  resetInMs: number;
}

/**
 * Atomically increments the counter of a fixed window and returns the new
 * value plus the remaining TTL:
 *
 *   - INCR creates the key at 1 when the window starts,
 *   - PEXPIRE is issued only for that first hit, so the window does not slide
 *     on later requests,
 *   - PTTL reports the remaining time, and a key that somehow lost its TTL gets
 *     one back instead of banning the IP forever.
 *
 * Everything runs inside one Lua script so the read-modify-write cannot be
 * interleaved by a concurrent request. A `get` -> compare -> `set` in the
 * application would let a burst of N parallel requests all read the same count
 * and all pass, which is exactly the flood this limit exists to stop.
 */
const INCREMENT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
local ttl
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
else
  ttl = redis.call('PTTL', KEYS[1])
  if ttl < 0 then
    redis.call('PEXPIRE', KEYS[1], ARGV[1])
    ttl = tonumber(ARGV[1])
  end
end
return {count, ttl}
`;

interface MemoryRecord {
  count: number;
  resetAt: number;
}

/** Minimal slice of the node-redis client the counter needs. */
interface EvalCapableClient {
  eval(
    script: string,
    options: { keys: string[]; arguments: string[] },
  ): Promise<unknown>;
}

/**
 * Fixed-window counter backed by the cache store that `CacheModule` was
 * registered with. Injected as a class so tests can swap it out wholesale.
 */
@Injectable()
export class RateLimitCounter {
  private readonly logger = new Logger(RateLimitCounter.name);
  private readonly env: string;
  private clientPromise?: Promise<EvalCapableClient | undefined>;
  /**
   * Serialises the in-process fallback. Node is single threaded, but an
   * `await` in the middle of a read-modify-write is still an interleaving
   * point, so fallback hits for one key queue behind each other.
   */
  private memoryQueue: Promise<unknown> = Promise.resolve();

  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly configService: ConfigService,
  ) {
    this.env = this.configService.get<string>('ENV', 'unknown');
  }

  private key(namespace: string, key: string): string {
    return `/${this.env}${namespace}/${key}`;
  }

  /**
   * Resolve the Redis client of the configured cache store, once. Returns
   * undefined when the store is not Redis (the in-memory fallback used when
   * `OBB_REDIS_URL` is unset), in which case the in-process counter is used.
   */
  private async resolveClient(): Promise<EvalCapableClient | undefined> {
    this.clientPromise ??= (async () => {
      const stores: unknown[] = this.cacheManager.stores ?? [];
      for (const store of stores) {
        const adapter = (store as { store?: unknown } | undefined)?.store as
          | { getClient?: () => Promise<unknown> }
          | undefined;
        if (typeof adapter?.getClient !== 'function') {
          continue;
        }
        const client = (await adapter.getClient()) as
          | EvalCapableClient
          | undefined;
        if (typeof client?.eval === 'function') {
          return client;
        }
      }
      this.logger.debug(
        'Cache store exposes no Redis client, counting rate limits in process',
      );
      return undefined;
    })();
    return this.clientPromise;
  }

  /**
   * Record one hit against `namespace/key` and report the window state.
   * Throws whatever the backend throws - callers decide whether an unusable
   * counter should fail open.
   */
  async hit(
    namespace: string,
    key: string,
    windowMs: number,
  ): Promise<RateLimitHit> {
    const fullKey = this.key(namespace, key);
    const client = await this.resolveClient();
    if (!client) {
      return this.hitInMemory(fullKey, windowMs);
    }

    const reply = await client.eval(INCREMENT_SCRIPT, {
      keys: [fullKey],
      arguments: [String(windowMs)],
    });
    const [count, ttl] = reply as [number, number];
    return {
      count: Number(count),
      resetInMs: Number(ttl) > 0 ? Number(ttl) : windowMs,
    };
  }

  /** Fallback for a non-Redis store: same fixed-window semantics, serialised. */
  private hitInMemory(
    fullKey: string,
    windowMs: number,
  ): Promise<RateLimitHit> {
    const next = this.memoryQueue.then(async (): Promise<RateLimitHit> => {
      const now = Date.now();
      const record = await this.cacheManager.get<MemoryRecord>(fullKey);
      if (!record || now >= record.resetAt) {
        const created: MemoryRecord = { count: 1, resetAt: now + windowMs };
        await this.cacheManager.set(fullKey, created, windowMs);
        return { count: 1, resetInMs: windowMs };
      }
      const updated: MemoryRecord = {
        count: record.count + 1,
        resetAt: record.resetAt,
      };
      // Keep the original deadline: the window must not extend on later hits.
      await this.cacheManager.set(fullKey, updated, record.resetAt - now);
      return { count: updated.count, resetInMs: record.resetAt - now };
    });
    // Keep the chain alive even if this hit rejects, so one failure does not
    // wedge every later request on the same process.
    this.memoryQueue = next.catch(() => undefined);
    return next;
  }
}
