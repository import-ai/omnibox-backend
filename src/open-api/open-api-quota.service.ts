import { HttpStatus, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { NamespacesQuotaService } from 'omniboxd/namespaces/namespaces-quota.service';
import { createClient, RedisClientType } from 'redis';

const ROLLING_WINDOW_MS = 24 * 60 * 60 * 1000;

const CONSUME_QUOTA_SCRIPT = `
local current = redis.call('GET', KEYS[1])
local limit = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])

if current and tonumber(current) >= limit then
  return {0, tonumber(current), redis.call('PTTL', KEYS[1])}
end

local next = redis.call('INCR', KEYS[1])
if next == 1 then
  redis.call('PEXPIRE', KEYS[1], ttl)
end

return {1, next, redis.call('PTTL', KEYS[1])}
`;

@Injectable()
export class OpenAPIQuotaService implements OnModuleDestroy {
  private redisClient: RedisClientType | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly namespacesQuotaService: NamespacesQuotaService,
  ) {}

  async onModuleDestroy(): Promise<void> {
    if (this.redisClient?.isOpen) {
      await this.redisClient.quit();
    }
  }

  async assertAndConsume(namespaceId: string): Promise<void> {
    const usage =
      await this.namespacesQuotaService.getNamespaceUsage(namespaceId);
    const limit = Math.floor(usage.openApiRequestsPer24h ?? 0);
    if (limit <= 0) {
      return;
    }

    const client = await this.getRedisClient();
    const key = `open-api-requests-per-24h:${namespaceId}`;
    const result = (await client.eval(CONSUME_QUOTA_SCRIPT, {
      keys: [key],
      arguments: [limit.toString(), ROLLING_WINDOW_MS.toString()],
    })) as [number, number, number];

    const [allowed] = result;
    if (allowed === 1) {
      return;
    }

    throw new AppException(
      'Open API requests per 24 hours exceeded',
      'OPEN_API_REQUESTS_PER_24H_EXCEEDED',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private async getRedisClient(): Promise<RedisClientType> {
    if (this.redisClient?.isOpen) {
      return this.redisClient;
    }

    const redisUrl = this.configService.get<string>('OBB_REDIS_URL');
    if (!redisUrl) {
      throw new Error(
        'OBB_REDIS_URL is required when Open API requests per 24h quota is enabled',
      );
    }

    this.redisClient = createClient({ url: redisUrl });
    await this.redisClient.connect();
    return this.redisClient;
  }
}
