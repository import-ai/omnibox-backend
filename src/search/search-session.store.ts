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
const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_SESSIONS = 1000;
const DEFAULT_MAX_USER_SESSIONS = 3;
const LOCK_MS = 30_000;

const positiveInteger = (
  config: ConfigService,
  key: string,
  fallback: number,
): number => {
  const raw = config.get(key);
  if (raw === undefined || raw === null || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1)
    throw new SearchSessionError('SEARCH_CONFIGURATION_INVALID');
  return value;
};

@Injectable()
export class SearchSessionStore implements OnModuleDestroy {
  private readonly redis?: Redis;
  private readonly prefix: string;
  private readonly maxBytes: number;
  private readonly maxSessions: number;
  private readonly maxUserSessions: number;
  private readonly memory = new Map<
    string,
    { owner: string; value: string; expires: number }
  >();
  private readonly locks = new Map<string, string>();

  constructor(config: ConfigService) {
    this.prefix = `${config.get('ENV', 'unknown')}:search-snapshot:`;
    this.maxBytes = positiveInteger(
      config,
      'OBB_SEARCH_SESSION_MAX_BYTES',
      DEFAULT_MAX_BYTES,
    );
    this.maxSessions = positiveInteger(
      config,
      'OBB_SEARCH_SESSION_MAX_SESSIONS',
      DEFAULT_MAX_SESSIONS,
    );
    this.maxUserSessions = positiveInteger(
      config,
      'OBB_SEARCH_SESSION_MAX_USER_SESSIONS',
      DEFAULT_MAX_USER_SESSIONS,
    );
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
        if (Buffer.byteLength(serialized) > this.maxBytes)
          throw new SearchSessionError('SEARCH_CAPACITY', 429);
        const savedAt = Date.now();
        if (this.redis) {
          const result = await this.redis.eval(
            `
            local prefix = ARGV[8]
            local function drop(sessionKey)
              redis.call('DEL', sessionKey, sessionKey .. ':lock')
              redis.call('ZREM', KEYS[3], sessionKey)
              local rest = string.sub(sessionKey, string.len(prefix) + 1)
              local sep = string.find(rest, ':', 1, true)
              if sep then
                redis.call('ZREM', prefix .. 'owner:' .. string.sub(rest, 1, sep - 1), sessionKey)
              end
            end
            if redis.call('GET', KEYS[2]) ~= ARGV[1] then return -1 end
            redis.call('ZREMRANGEBYSCORE', KEYS[3], '-inf', ARGV[3])
            redis.call('ZREMRANGEBYSCORE', KEYS[4], '-inf', ARGV[3])
            if not redis.call('GET', KEYS[1]) then
              while redis.call('ZCARD', KEYS[4]) >= tonumber(ARGV[6]) do
                local oldest = redis.call('ZRANGE', KEYS[4], 0, 0)[1]
                if not oldest then break end
                drop(oldest)
              end
              while redis.call('ZCARD', KEYS[3]) >= tonumber(ARGV[5]) do
                local oldest = redis.call('ZRANGE', KEYS[3], 0, 0)[1]
                if not oldest then break end
                drop(oldest)
              end
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
            savedAt,
            savedAt + TTL_MS,
            this.maxSessions,
            this.maxUserSessions,
            TTL_MS,
            this.prefix,
          );
          if (result !== 1)
            throw new SearchSessionError('SEARCH_SESSION_BUSY', 409);
        } else {
          if (this.locks.get(key) !== token)
            throw new SearchSessionError('SEARCH_SESSION_BUSY', 409);
          if (!this.memory.has(key)) {
            this.evictOwnerSessions(owner);
            while (this.memory.size >= this.maxSessions)
              this.evictOldestSession();
          }
          this.memory.set(key, {
            owner,
            value: serialized,
            expires: savedAt + TTL_MS,
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

  private evictSession(key: string) {
    this.memory.delete(key);
    this.locks.delete(key);
  }

  private evictOwnerSessions(owner: string) {
    for (;;) {
      const owned = [...this.memory.entries()]
        .filter(([, entry]) => entry.owner === owner)
        .sort((a, b) => a[1].expires - b[1].expires);
      if (owned.length < this.maxUserSessions) return;
      this.evictSession(owned[0][0]);
    }
  }

  private evictOldestSession() {
    const oldest = [...this.memory.entries()].sort(
      (a, b) => a[1].expires - b[1].expires,
    )[0];
    if (oldest) this.evictSession(oldest[0]);
  }
}
