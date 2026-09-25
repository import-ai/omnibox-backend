import { createHash } from 'node:crypto';

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheService } from 'omniboxd/common/cache.service';
import { createClient } from 'redis';

export interface OAuthCodeData {
  code: string;
  clientId: string;
  userId: string;
  redirectUri: string;
  scope: string;
  codeChallenge: string | null;
  codeChallengeMethod: string | null;
  createdAt: number;
}

export interface OAuthTokenData {
  token: string;
  clientId: string;
  userId: string;
  scope: string;
  createdAt: number;
  expiresIn: number;
}

@Injectable()
export class OAuthTokenStoreService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OAuthTokenStoreService.name);
  private redis?: ReturnType<typeof createClient>;
  private connecting?: Promise<unknown>;
  private readonly tokenNamespace = '/oauth/tokens';
  private readonly userTokensNamespace = '/oauth/user-tokens';

  constructor(
    private readonly cacheService: CacheService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const url = this.config.get<string>('OBB_REDIS_URL');
    if (!url) return;
    this.redis = createClient({
      url,
      socket: { reconnectStrategy: false, connectTimeout: 5000 },
    });
    this.redis.on('error', () =>
      this.logger.error('OAuth Redis connection failed'),
    );
  }

  async onModuleDestroy() {
    if (this.redis?.isOpen) await this.redis.quit();
  }

  private async codeStore() {
    if (this.redis && !this.redis.isOpen) {
      this.connecting ??= this.redis.connect().finally(() => {
        this.connecting = undefined;
      });
    }
    try {
      await this.connecting;
    } catch {
      throw new ServiceUnavailableException(
        'OAuth authorization requires Redis',
      );
    }
    if (!this.redis?.isReady)
      throw new ServiceUnavailableException(
        'OAuth authorization requires Redis',
      );
    return this.redis;
  }

  private codeKey(code: string) {
    const hash = createHash('sha256').update(code).digest('hex');
    return `/${this.config.get<string>('ENV', 'unknown')}/oauth/codes/${hash}`;
  }

  async saveAuthorizationCode(
    data: OAuthCodeData,
    ttlMs: number,
  ): Promise<void> {
    const { code, ...payload } = data;
    const saved = await (
      await this.codeStore()
    ).set(this.codeKey(code), JSON.stringify(payload), { PX: ttlMs, NX: true });
    if (!saved)
      throw new ServiceUnavailableException('Authorization code collision');
  }

  async getAuthorizationCode(code: string): Promise<OAuthCodeData | null> {
    const payload = await (await this.codeStore()).get(this.codeKey(code));
    return payload ? { ...JSON.parse(payload), code } : null;
  }

  async consumeAuthorizationCode(code: string): Promise<boolean> {
    // Codes are immutable and never reused. Only one validated exchange can delete the key.
    return (await (await this.codeStore()).del(this.codeKey(code))) === 1;
  }

  async saveAccessToken(data: OAuthTokenData, ttlMs: number): Promise<void> {
    await this.cacheService.set(this.tokenNamespace, data.token, data, ttlMs);

    // Track token for user-level revocation
    const userTokens = await this.getUserTokens(data.userId);
    userTokens.push(data.token);
    await this.cacheService.set(
      this.userTokensNamespace,
      data.userId,
      userTokens,
      ttlMs,
    );
  }

  async getAccessToken(token: string): Promise<OAuthTokenData | null> {
    return this.cacheService.get<OAuthTokenData>(this.tokenNamespace, token);
  }

  async deleteAccessToken(token: string): Promise<void> {
    await this.cacheService.delete(this.tokenNamespace, token);
  }

  async deleteAllUserTokens(userId: string): Promise<void> {
    const userTokens = await this.getUserTokens(userId);

    for (const token of userTokens) {
      await this.cacheService.delete(this.tokenNamespace, token);
    }

    await this.cacheService.delete(this.userTokensNamespace, userId);
  }

  private async getUserTokens(userId: string): Promise<string[]> {
    const tokens = await this.cacheService.get<string[]>(
      this.userTokensNamespace,
      userId,
    );
    return tokens ?? [];
  }
}
