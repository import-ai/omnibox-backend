import { Injectable, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { nanoid } from 'nanoid';
import { OAuthConfig, DEFAULT_OAUTH_CONFIG } from './types';
import { UserService } from 'omniboxd/user/user.service';

interface AuthorizationCode {
  code: string;
  userId: string;
  clientId: string;
  redirectUri: string;
  expiresAt: Date;
}

@Injectable()
export class OAuthService {
  private config: OAuthConfig = DEFAULT_OAUTH_CONFIG;
  private authorizationCodes: Map<string, AuthorizationCode> = new Map();

  constructor(
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
  ) {}

  createAuthorizationCode(
    userId: string,
    clientId: string,
    redirectUri: string,
  ) {
    const code = nanoid(32);
    const expiresAt = new Date();
    expiresAt.setMinutes(
      expiresAt.getMinutes() + this.config.authorizationCodeExpiryMinutes,
    );

    const authCode: AuthorizationCode = {
      code,
      userId,
      clientId,
      redirectUri,
      expiresAt,
    };

    this.cleanupExpiredCodes();
    this.authorizationCodes.set(code, authCode);
    return code;
  }

  async exchangeCodeForTokens(code: string, clientId: string) {
    const authCode = this.authorizationCodes.get(code);

    if (!authCode || authCode.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired authorization code');
    }

    if (authCode.clientId !== clientId) {
      throw new BadRequestException('Invalid authorization code');
    }

    this.authorizationCodes.delete(code);
    this.cleanupExpiredCodes();
    return await this.generateAccessToken(authCode.userId, clientId);
  }

  private async generateAccessToken(userId: string, clientId: string) {
    const user = await this.userService.find(userId);
    if (!user) {
      throw new BadRequestException('Invalid user');
    }
    const payload = {
      sub: userId,
      client_id: clientId,
      email: user.email,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      access_token: accessToken,
    };
  }

  private cleanupExpiredCodes() {
    const now = new Date();
    for (const [code, authCode] of this.authorizationCodes.entries()) {
      if (authCode.expiresAt < now) {
        this.authorizationCodes.delete(code);
      }
    }
  }
}
