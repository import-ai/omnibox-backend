import { Injectable } from '@nestjs/common';
import { CacheService } from 'omniboxd/common/cache.service';

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
export class OAuthTokenStoreService {
  private readonly codeNamespace = '/oauth/codes';
  private readonly tokenNamespace = '/oauth/tokens';
  private readonly userTokensNamespace = '/oauth/user-tokens';

  constructor(private readonly cacheService: CacheService) {}

  async saveAuthorizationCode(
    data: OAuthCodeData,
    ttlMs: number,
  ): Promise<void> {
    await this.cacheService.set(this.codeNamespace, data.code, data, ttlMs);
  }

  async getAuthorizationCode(code: string): Promise<OAuthCodeData | null> {
    return this.cacheService.get<OAuthCodeData>(this.codeNamespace, code);
  }

  async deleteAuthorizationCode(code: string): Promise<void> {
    await this.cacheService.delete(this.codeNamespace, code);
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
