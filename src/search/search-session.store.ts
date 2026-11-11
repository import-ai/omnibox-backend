import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';

export class SearchSessionError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 503,
  ) {
    super(code);
  }
}

const TTL_MS = 120_000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_SESSIONS = 100;
const MAX_USER_SESSIONS = 3;
const LOCK_MS = 30_000;

@Injectable()
export class SearchSessionStore implements OnModuleDestroy {
  private readonly redis?: Redis;
  private readonly prefix: string;
  private readonly memory = new Map<
    string,
    { owner: string; value: string; expires: number }
  >();
  private readonly locks = new Map<string, string>();

  constructor(config: ConfigService) {
    this.prefix = `${config.get('ENV', 'unknown')}:search-snapshot:`;
    const url = config.get<string>('OBB_REDIS_URL');
    const nodeEnv = config.get('NODE_ENV', process.env.NODE_ENV);
    const memoryAllowed =
      nodeEnv === 'test' ||
      String(config.get('OBB_SEARCH_SESSION_MEMORY', false)) === 'true';
    const production =
      nodeEnv === 'production' ||
      ['pre', 'prod'].includes(config.get('ENV', 'local'));
    if (!url && (!memoryAllowed || production)) {
      throw new SearchSessionError('SEARCH_REDIS_REQUIRED');
    }
    if (url) {
      this.redis = new Redis(url, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      });
      this.redis.on('error', () => undefined);
    }
  }

  onModuleDestroy() {
    this.redis?.disconnect();
  }

  async exclusive<T, R>(
    owner: string,
    id: string,
    operation: (
      value: T | null,
      save: (value: T) => Promise<void>,
    ) => Promise<R>,
  ): Promise<R> {
    const key = this.prefix + owner + ':' + id;
    const token = randomUUID();
    if (this.redis) {
      if (this.redis.status === 'wait') await this.redis.connect();
      if (
        (await this.redis.set(key + ':lock', token, 'PX', LOCK_MS, 'NX')) !==
        'OK'
      ) {
        throw new SearchSessionError('SEARCH_SESSION_BUSY', 409);
      }
    } else {
      if (this.locks.has(key))
        throw new SearchSessionError('SEARCH_SESSION_BUSY', 409);
      this.locks.set(key, token);
    }
    try {
      const now = Date.now();
      for (const [k, entry] of this.memory)
        if (entry.expires <= now) this.memory.delete(k);
      const raw = this.redis
        ? await this.redis.get(key)
        : this.memory.get(key)?.value;
      const save = async (value: T) => {
        const serialized = JSON.stringify(value);
        if (Buffer.byteLength(serialized) > MAX_BYTES)
          throw new SearchSessionError('SEARCH_CAPACITY', 429);
        if (this.redis) {
          const result = await this.redis.eval(
            `
            if redis.call('GET', KEYS[2]) ~= ARGV[1] then return -1 end
            redis.call('ZREMRANGEBYSCORE', KEYS[3], '-inf', ARGV[3])
            redis.call('ZREMRANGEBYSCORE', KEYS[4], '-inf', ARGV[3])
            if not redis.call('GET', KEYS[1]) then
              if redis.call('ZCARD', KEYS[4]) >= tonumber(ARGV[6]) then
                local oldest = redis.call('ZRANGE', KEYS[4], 0, 0)[1]
                if oldest then
                  redis.call('DEL', oldest, oldest .. ':lock')
                  redis.call('ZREM', KEYS[3], oldest)
                  redis.call('ZREM', KEYS[4], oldest)
                end
              end
              if redis.call('ZCARD', KEYS[3]) >= tonumber(ARGV[5]) then return -2 end
            end
            redis.call('SET', KEYS[1], ARGV[2], 'PX', ARGV[7])
            redis.call('ZADD', KEYS[3], ARGV[4], KEYS[1])
            redis.call('ZADD', KEYS[4], ARGV[4], KEYS[1])
            redis.call('PEXPIRE', KEYS[3], ARGV[7])
            redis.call('PEXPIRE', KEYS[4], ARGV[7])
            return 1`,
            4,
            key,
            key + ':lock',
            this.prefix + 'all',
            this.prefix + 'owner:' + owner,
            token,
            serialized,
            Date.now(),
            Date.now() + TTL_MS,
            MAX_SESSIONS,
            MAX_USER_SESSIONS,
            TTL_MS,
          );
          if (result !== 1)
            throw new SearchSessionError(
              result === -2 ? 'SEARCH_CAPACITY' : 'SEARCH_SESSION_BUSY',
              result === -2 ? 429 : 409,
            );
        } else {
          if (this.locks.get(key) !== token)
            throw new SearchSessionError('SEARCH_SESSION_BUSY', 409);
          if (!this.memory.has(key)) {
            const owned = [...this.memory.entries()]
              .filter(([, entry]) => entry.owner === owner)
              .sort((a, b) => a[1].expires - b[1].expires);
            if (owned.length >= MAX_USER_SESSIONS) {
              this.memory.delete(owned[0][0]);
              this.locks.delete(owned[0][0]);
            }
          }
          if (
            !this.memory.has(key) &&
            (this.memory.size >= MAX_SESSIONS ||
              [...this.memory.values()].filter((e) => e.owner === owner)
                .length >= MAX_USER_SESSIONS)
          ) {
            throw new SearchSessionError('SEARCH_CAPACITY', 429);
          }
          this.memory.set(key, {
            owner,
            value: serialized,
            expires: Date.now() + TTL_MS,
          });
        }
      };
      return await operation(raw ? JSON.parse(raw) : null, save);
    } finally {
      if (this.redis) {
        await this.redis.eval(
          "if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0",
          1,
          key + ':lock',
          token,
        );
      } else if (this.locks.get(key) === token) this.locks.delete(key);
    }
  }
}
