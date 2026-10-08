import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheableMemory } from 'cacheable';

export class AtomicMemoryCache extends CacheableMemory {
  override delete(key: string): boolean {
    const existed = this.get(key) !== undefined;
    super.delete(key);
    return existed;
  }
}

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

  async consume(namespace: string, key: string): Promise<boolean> {
    const stores = this.cacheManager.stores;
    if (stores.length !== 1) {
      throw new Error('Atomic cache consumption requires a single store');
    }
    // cache-manager.del discards the store's actual deletion result.
    return stores[0].delete(this.getKey(namespace, key));
  }

  async delete(namespace: string, key: string): Promise<void> {
    await this.cacheManager.del(this.getKey(namespace, key));
  }
}
