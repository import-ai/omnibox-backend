import { Inject, Injectable } from '@nestjs/common';
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class KVStore<T> {
  private readonly env: string;

  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly namespace: string,
    private readonly configService: ConfigService,
  ) {
    this.env = this.configService.get<string>('ENV', 'unknown');
  }

  private getKey(key: string): string {
    return `/${this.env}${this.namespace}/${key}`;
  }

  async get(key: string): Promise<T | null> {
    return await this.cacheManager.get<T>(this.getKey(key));
  }

  async set(key: string, value: T, ttl?: number): Promise<void> {
    await this.cacheManager.set(this.getKey(key), value, ttl);
  }

  async delete(key: string): Promise<void> {
    await this.cacheManager.del(this.getKey(key));
  }
}
