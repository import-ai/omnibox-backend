import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { OAuthClient } from './entities/oauth-client.entity';
import { OAuthToken } from './entities/oauth-token.entity';
import { OAuthAuthorizationCode } from './entities/oauth-authorization-code.entity';
import { User } from 'omniboxd/user/entities/user.entity';

@Injectable()
export class OAuthService {
  constructor(
    @InjectRepository(OAuthClient)
    private clientRepository: Repository<OAuthClient>,
    @InjectRepository(OAuthToken)
    private tokenRepository: Repository<OAuthToken>,
    @InjectRepository(OAuthAuthorizationCode)
    private authCodeRepository: Repository<OAuthAuthorizationCode>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
  ) {}

  async getClient(
    clientId: string,
    clientSecret?: string,
  ): Promise<OAuthClient | null> {
    const client = await this.clientRepository.findOne({
      where: { clientId, isActive: true },
    });

    if (!client) {
      return null;
    }

    if (clientSecret && client.isConfidential) {
      const isValid = await bcrypt.compare(clientSecret, client.clientSecret);
      if (!isValid) {
        return null;
      }
    }

    return client;
  }

  async generateAuthorizationCode(
    client: OAuthClient,
    user: User,
    scopes: string[],
    redirectUri: string,
    codeChallenge?: string,
    codeChallengeMethod?: string,
  ): Promise<string> {
    const code = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const authCode = this.authCodeRepository.create({
      code,
      expiresAt,
      redirectUri,
      scopes,
      clientId: client.id,
      userId: user.id,
      codeChallenge,
      codeChallengeMethod,
    });

    await this.authCodeRepository.save(authCode);
    return code;
  }

  async getAuthorizationCode(
    code: string,
  ): Promise<OAuthAuthorizationCode | null> {
    const authCode = await this.authCodeRepository.findOne({
      where: { code, isUsed: false },
      relations: ['client', 'user'],
    });

    if (!authCode || authCode.expiresAt < new Date()) {
      return null;
    }

    return authCode;
  }

  async revokeAuthorizationCode(code: string): Promise<void> {
    await this.authCodeRepository.update({ code }, { isUsed: true });
  }

  async generateTokens(
    client: OAuthClient,
    user: User,
    scopes: string[],
    authorizationCodeUsed?: string,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const accessTokenPayload = {
      sub: user.id,
      client_id: client.clientId,
      scope: scopes.join(' '),
      type: 'access_token',
    };

    const refreshTokenPayload = {
      sub: user.id,
      client_id: client.clientId,
      type: 'refresh_token',
    };

    const accessToken = this.jwtService.sign(accessTokenPayload, {
      expiresIn: '1h',
    });
    const refreshToken = this.jwtService.sign(refreshTokenPayload, {
      expiresIn: '30d',
    });

    const expiresIn = 3600; // 1 hour in seconds
    const accessTokenExpiresAt = new Date(Date.now() + expiresIn * 1000);
    const refreshTokenExpiresAt = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000,
    ); // 30 days

    const tokenEntity = this.tokenRepository.create({
      accessToken,
      refreshToken,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
      scopes,
      clientId: client.id,
      userId: user.id,
      authorizationCodeUsed,
    });

    await this.tokenRepository.save(tokenEntity);

    return {
      accessToken,
      refreshToken,
      expiresIn,
    };
  }

  async getAccessToken(accessToken: string): Promise<OAuthToken | null> {
    const token = await this.tokenRepository.findOne({
      where: { accessToken, isRevoked: false },
      relations: ['client', 'user'],
    });

    if (!token || token.accessTokenExpiresAt < new Date()) {
      return null;
    }

    return token;
  }

  async getRefreshToken(refreshToken: string): Promise<OAuthToken | null> {
    const token = await this.tokenRepository.findOne({
      where: { refreshToken, isRevoked: false },
      relations: ['client', 'user'],
    });

    if (!token || token.refreshTokenExpiresAt < new Date()) {
      return null;
    }

    return token;
  }

  async revokeToken(tokenId: string): Promise<void> {
    await this.tokenRepository.update(tokenId, { isRevoked: true });
  }

  validateRedirectUri(client: OAuthClient, redirectUri: string): boolean {
    return client.redirectUris.includes(redirectUri);
  }

  validateScopes(client: OAuthClient, requestedScopes: string[]): boolean {
    return requestedScopes.every((scope) => client.scopes.includes(scope));
  }

  validateCodeChallenge(
    codeVerifier: string,
    codeChallenge: string,
    method: string = 'S256',
  ): boolean {
    if (method === 'S256') {
      const hash = crypto.createHash('sha256').update(codeVerifier).digest();
      const computedChallenge = hash.toString('base64url');
      return computedChallenge === codeChallenge;
    } else if (method === 'plain') {
      return codeVerifier === codeChallenge;
    }
    return false;
  }

  async createClient(
    name: string,
    redirectUris: string[],
    ownerId: string,
    options: {
      description?: string;
      scopes?: string[];
      grants?: string[];
      isConfidential?: boolean;
      logoUrl?: string;
      websiteUrl?: string;
      privacyPolicyUrl?: string;
      termsOfServiceUrl?: string;
    } = {},
  ): Promise<{ clientId: string; clientSecret: string; client: OAuthClient }> {
    const clientId = crypto.randomBytes(16).toString('hex');
    const clientSecret = crypto.randomBytes(32).toString('hex');
    const hashedSecret = await bcrypt.hash(clientSecret, 10);

    const client = this.clientRepository.create({
      clientId,
      clientSecret: hashedSecret,
      name,
      description: options.description || '',
      redirectUris,
      grants: options.grants || ['authorization_code', 'refresh_token'],
      scopes: options.scopes || ['openid', 'profile', 'email'],
      isConfidential: options.isConfidential ?? true,
      logoUrl: options.logoUrl,
      websiteUrl: options.websiteUrl,
      privacyPolicyUrl: options.privacyPolicyUrl,
      termsOfServiceUrl: options.termsOfServiceUrl,
      ownerId,
    });

    const savedClient = await this.clientRepository.save(client);

    return { clientId, clientSecret, client: savedClient };
  }
}
