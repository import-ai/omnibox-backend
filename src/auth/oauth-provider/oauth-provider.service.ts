import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { UserService } from 'omniboxd/user/user.service';

import { AuthService } from '../auth.service';
import { AuthorizeRequestDto } from './dto/authorize-request.dto';
import { TokenRequestDto, TokenResponseDto } from './dto/token-request.dto';
import { UserinfoResponseDto } from './dto/userinfo-response.dto';
import { DESKTOP_CLIENT_ID, OAuthClientService } from './oauth-client.service';
import { OAuthTokenStoreService } from './oauth-token-store.service';
import { PairwiseSubjectService } from './pairwise-subject.service';

@Injectable()
export class OAuthProviderService {
  private readonly logger = new Logger(OAuthProviderService.name);
  private readonly codeExpireSeconds: number;
  private readonly tokenExpireSeconds: number;

  constructor(
    private readonly authService: AuthService,
    private readonly tokenStore: OAuthTokenStoreService,
    private readonly clientService: OAuthClientService,
    private readonly pairwiseSubjectService: PairwiseSubjectService,
    private readonly userService: UserService,
    private readonly configService: ConfigService,
    private readonly i18n: I18nService,
  ) {
    this.codeExpireSeconds = parseInt(
      this.configService.get('OBB_OAUTH_CODE_EXPIRE', '600'),
      10,
    );
    this.tokenExpireSeconds = parseInt(
      this.configService.get('OBB_OAUTH_TOKEN_EXPIRE', '3600'),
      10,
    );
  }

  private async validateAuthorization(dto: AuthorizeRequestDto) {
    const client = await this.clientService.findByClientId(dto.client_id);

    if (!client) {
      throw new AppException(
        this.i18n.t('auth.oauth.errors.invalidClient'),
        'OAUTH_INVALID_CLIENT',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!this.clientService.validateRedirectUri(client, dto.redirect_uri)) {
      throw new AppException(
        this.i18n.t('auth.oauth.errors.invalidRedirectUri'),
        'OAUTH_INVALID_REDIRECT_URI',
        HttpStatus.BAD_REQUEST,
      );
    }

    const requestedScopes = dto.scope
      ? dto.scope.split(' ')
      : ['openid', 'profile', 'email'];
    const validScopes = this.clientService.validateScopes(
      client,
      requestedScopes,
    );

    if (validScopes.length === 0) {
      throw new AppException(
        this.i18n.t('auth.oauth.errors.invalidScope'),
        'OAUTH_INVALID_SCOPE',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (
      client.clientId === DESKTOP_CLIENT_ID &&
      (dto.redirect_uri !== 'omnibox://oauth/callback' ||
        dto.code_challenge_method !== 'S256' ||
        !/^[A-Za-z0-9_-]{43}$/.test(dto.code_challenge || '') ||
        !/^[A-Za-z0-9_-]{43,128}$/.test(dto.state || ''))
    )
      this.invalidRequest();
    return { client, validScopes };
  }
  private invalidRequest(): never {
    throw new AppException(
      this.i18n.t('auth.oauth.errors.invalidCode'),
      'OAUTH_INVALID_REQUEST',
      HttpStatus.BAD_REQUEST,
    );
  }
  async context(dto: AuthorizeRequestDto, userId: string) {
    const { client } = await this.validateAuthorization(dto);
    const user = await this.userService.find(userId);
    if (!user) this.invalidRequest();
    return {
      client: {
        name: client.name,
        first_party: client.clientId === DESKTOP_CLIENT_ID,
      },
      account: { id: user.id, username: user.username, email: user.email },
    };
  }
  async confirm(
    dto: AuthorizeRequestDto,
    userId: string,
    expectedUserId: string,
    authorization: string,
  ) {
    if (
      !/^Bearer \S+$/.test(authorization || '') ||
      this.authService.jwtVerify(authorization.slice(7)).sub !== userId
    )
      this.invalidRequest();
    return this.authorize(dto, userId, expectedUserId);
  }

  async authorize(
    dto: AuthorizeRequestDto,
    userId: string,
    confirmedUserId?: string,
  ): Promise<{ redirectUrl: string }> {
    const { client, validScopes } = await this.validateAuthorization(dto);
    if (client.clientId === DESKTOP_CLIENT_ID && confirmedUserId !== userId)
      this.invalidRequest();
    const code = this.generateAuthorizationCode();
    const ttlMs =
      (client.clientId === DESKTOP_CLIENT_ID ? 60 : this.codeExpireSeconds) *
      1000;

    await this.tokenStore.saveAuthorizationCode(
      {
        code,
        clientId: dto.client_id,
        userId,
        redirectUri: dto.redirect_uri,
        scope: validScopes.join(' '),
        codeChallenge: dto.code_challenge || null,
        codeChallengeMethod: dto.code_challenge_method || null,
        createdAt: Date.now(),
      },
      ttlMs,
    );

    this.logger.log(
      `Generated authorization code for user ${userId} and client ${dto.client_id}`,
    );

    const redirectUrl = new URL(dto.redirect_uri);
    redirectUrl.searchParams.set('code', code);
    if (dto.state) {
      redirectUrl.searchParams.set('state', dto.state);
    }

    return { redirectUrl: redirectUrl.toString() };
  }

  async exchangeToken(dto: TokenRequestDto): Promise<TokenResponseDto> {
    const authCode = await this.tokenStore.getAuthorizationCode(dto.code);

    if (!authCode) {
      throw new AppException(
        this.i18n.t('auth.oauth.errors.invalidCode'),
        'OAUTH_INVALID_CODE',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Only an unexpired, unconsumed authorization code can be exchanged.

    if (authCode.clientId !== dto.client_id) {
      throw new AppException(
        this.i18n.t('auth.oauth.errors.clientMismatch'),
        'OAUTH_CLIENT_MISMATCH',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (authCode.redirectUri !== dto.redirect_uri) {
      throw new AppException(
        this.i18n.t('auth.oauth.errors.redirectUriMismatch'),
        'OAUTH_REDIRECT_URI_MISMATCH',
        HttpStatus.BAD_REQUEST,
      );
    }

    const client = await this.clientService.findByClientId(dto.client_id);
    if (
      !client ||
      !this.clientService.validateRedirectUri(client, dto.redirect_uri)
    )
      this.invalidRequest();
    if (
      client.clientId === DESKTOP_CLIENT_ID &&
      (dto.redirect_uri !== 'omnibox://oauth/callback' ||
        authCode.codeChallengeMethod !== 'S256' ||
        !authCode.codeChallenge ||
        !/^[A-Za-z0-9._~-]{43,128}$/.test(dto.code_verifier || ''))
    )
      this.invalidRequest();
    if (authCode.codeChallenge) {
      if (!dto.code_verifier) {
        throw new AppException(
          this.i18n.t('auth.oauth.errors.codeVerifierRequired'),
          'OAUTH_CODE_VERIFIER_REQUIRED',
          HttpStatus.BAD_REQUEST,
        );
      }

      const isValidPkce = this.verifyPkce(
        dto.code_verifier,
        authCode.codeChallenge,
        authCode.codeChallengeMethod || 'S256',
      );

      if (!isValidPkce) {
        throw new AppException(
          this.i18n.t('auth.oauth.errors.invalidCodeVerifier'),
          'OAUTH_INVALID_CODE_VERIFIER',
          HttpStatus.BAD_REQUEST,
        );
      }
    } else {
      // Require client_secret for non-PKCE flows
      if (!dto.client_secret) {
        throw new AppException(
          this.i18n.t('auth.oauth.errors.clientSecretRequired'),
          'OAUTH_CLIENT_SECRET_REQUIRED',
          HttpStatus.BAD_REQUEST,
        );
      }
      await this.clientService.validateClient(dto.client_id, dto.client_secret);
    }

    if (!(await this.tokenStore.consumeAuthorizationCode(dto.code)))
      this.invalidRequest();
    if (client.clientId === DESKTOP_CLIENT_ID) {
      const user = await this.userService.find(authCode.userId);
      if (!user) this.invalidRequest();
      const credential = this.authService.login(user);
      const payload = this.authService.jwtVerify(credential.access_token);
      return {
        ...credential,
        token_type: 'Bearer',
        expires_in: Math.max(0, payload.exp - Math.floor(Date.now() / 1000)),
        scope: authCode.scope,
      };
    }

    const token = this.generateAccessToken();
    const ttlMs = this.tokenExpireSeconds * 1000;

    await this.tokenStore.saveAccessToken(
      {
        token,
        clientId: authCode.clientId,
        userId: authCode.userId,
        scope: authCode.scope,
        createdAt: Date.now(),
        expiresIn: this.tokenExpireSeconds,
      },
      ttlMs,
    );

    this.logger.log(
      `Issued access token for user ${authCode.userId} and client ${authCode.clientId}`,
    );

    return {
      access_token: token,
      token_type: 'Bearer',
      expires_in: this.tokenExpireSeconds,
      scope: authCode.scope,
    };
  }

  async getUserinfo(bearerToken: string): Promise<UserinfoResponseDto> {
    if (!bearerToken) {
      throw new AppException(
        this.i18n.t('auth.oauth.errors.invalidAccessToken'),
        'OAUTH_INVALID_ACCESS_TOKEN',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const token = bearerToken.replace(/^Bearer\s+/i, '');

    const accessToken = await this.tokenStore.getAccessToken(token);

    if (!accessToken) {
      throw new AppException(
        this.i18n.t('auth.oauth.errors.invalidAccessToken'),
        'OAUTH_INVALID_ACCESS_TOKEN',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // TTL handles expiration, deletion handles revocation - if token exists, it's valid

    const user = await this.userService.find(accessToken.userId);

    const pairwiseSubject = await this.pairwiseSubjectService.getOrCreate(
      accessToken.userId,
      accessToken.clientId,
    );

    const scopes = accessToken.scope.split(' ');
    const response: UserinfoResponseDto = {
      id: pairwiseSubject,
      sub: pairwiseSubject,
      name: user.username,
    };

    if (scopes.includes('email')) {
      response.email = user.email || `${pairwiseSubject}@email.local`;
    }

    return response;
  }

  async revokeToken(token: string): Promise<void> {
    await this.tokenStore.deleteAccessToken(token);
    this.logger.log(`Revoked access token`);
  }

  private generateAuthorizationCode(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private generateAccessToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private verifyPkce(
    codeVerifier: string,
    codeChallenge: string,
    method: string,
  ): boolean {
    if (method === 'plain') {
      return codeVerifier === codeChallenge;
    }

    const hash = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    return hash === codeChallenge;
  }
}
