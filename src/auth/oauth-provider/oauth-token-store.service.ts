import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { CacheService } from 'omniboxd/common/cache.service';
import { DataSource } from 'typeorm';

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
  private readonly tokenNamespace = '/oauth/tokens';
  private readonly userTokensNamespace = '/oauth/user-tokens';

  constructor(
    private readonly cacheService: CacheService,
    private readonly dataSource: DataSource,
  ) {}

  private codeHash(code: string) {
    return createHash('sha256').update(code).digest('hex');
  }

  async saveAuthorizationCode(
    data: OAuthCodeData,
    ttlMs: number,
  ): Promise<void> {
    const { code, ...payload } = data;
    await this.dataSource.query(
      'DELETE FROM oauth_authorization_codes WHERE expires_at <= now()',
    );
    await this.dataSource.query(
      "INSERT INTO oauth_authorization_codes (code_hash, data, expires_at) VALUES ($1, $2, now() + $3 * interval '1 millisecond')",
      [this.codeHash(code), payload, ttlMs],
    );
  }
  async getAuthorizationCode(code: string): Promise<OAuthCodeData | null> {
    const rows = await this.dataSource.query(
      'SELECT data FROM oauth_authorization_codes WHERE code_hash = $1 AND expires_at > now()',
      [this.codeHash(code)],
    );
    return rows[0] ? { ...rows[0].data, code } : null;
  }
  async consumeAuthorizationCode(code: string): Promise<boolean> {
    const rows = await this.dataSource.query(
      `WITH consumed AS (
        DELETE FROM oauth_authorization_codes WHERE code_hash = $1 AND expires_at > now() RETURNING code_hash
      ) SELECT count(*)::int AS count FROM consumed`,
      [this.codeHash(code)],
    );
    return rows[0].count === 1;
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
