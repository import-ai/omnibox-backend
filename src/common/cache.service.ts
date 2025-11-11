import { Inject, Injectable } from '@nestjs/common';
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CacheService {
  private readonly env: string;

  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly configService: ConfigService,
  ) {
    this.env = this.configService.get<string>('ENV', 'unknown');
  }

  private getKey(namespace: string, key: string): string {
    return `/${this.env}${namespace}/${key}`;
  }

  async get<T>(namespace: string, key: string): Promise<T | null> {
    return await this.cacheManager.get<T>(this.getKey(namespace, key));
  }

  /**
   * @param namespace
   * @param key
   * @param value
   * @param ttl Expiration time in milliseconds
   */
  async set<T>(
    namespace: string,
    key: string,
    value: T,
    ttl?: number,
  ): Promise<void> {
    await this.cacheManager.set(this.getKey(namespace, key), value, ttl);
  }

  async delete(namespace: string, key: string): Promise<void> {
    await this.cacheManager.del(this.getKey(namespace, key));
  }
}
