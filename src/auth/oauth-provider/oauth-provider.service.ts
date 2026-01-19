import { Injectable, HttpStatus, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, IsNull } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { I18nService } from 'nestjs-i18n';
import * as crypto from 'crypto';
import { OAuthAuthorizationCode } from './entities/oauth-authorization-code.entity';
import { OAuthAccessToken } from './entities/oauth-access-token.entity';
import { OAuthClientService } from './oauth-client.service';
import { PairwiseSubjectService } from './pairwise-subject.service';
import { UserService } from 'omniboxd/user/user.service';
import { AuthorizeRequestDto } from './dto/authorize-request.dto';
import { TokenRequestDto, TokenResponseDto } from './dto/token-request.dto';
import { UserinfoResponseDto } from './dto/userinfo-response.dto';
import { AppException } from 'omniboxd/common/exceptions/app.exception';

@Injectable()
export class OAuthProviderService {
  private readonly logger = new Logger(OAuthProviderService.name);
  private readonly codeExpireSeconds: number;
  private readonly tokenExpireSeconds: number;

  constructor(
    @InjectRepository(OAuthAuthorizationCode)
    private readonly authCodeRepository: Repository<OAuthAuthorizationCode>,
    @InjectRepository(OAuthAccessToken)
    private readonly accessTokenRepository: Repository<OAuthAccessToken>,
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

  async authorize(
    dto: AuthorizeRequestDto,
    userId: string,
  ): Promise<{ redirectUrl: string }> {
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

    const code = this.generateAuthorizationCode();
    const expiresAt = new Date(Date.now() + this.codeExpireSeconds * 1000);

    const authCode = this.authCodeRepository.create({
      code,
      clientId: dto.client_id,
      userId,
      redirectUri: dto.redirect_uri,
      scope: validScopes.join(' '),
      codeChallenge: dto.code_challenge || null,
      codeChallengeMethod: dto.code_challenge_method || null,
      expiresAt,
    });

    await this.authCodeRepository.save(authCode);

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
    const authCode = await this.authCodeRepository.findOne({
      where: { code: dto.code },
    });

    if (!authCode) {
      throw new AppException(
        this.i18n.t('auth.oauth.errors.invalidCode'),
        'OAUTH_INVALID_CODE',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (authCode.usedAt) {
      this.logger.warn(`Authorization code ${dto.code} has already been used`);
      throw new AppException(
        this.i18n.t('auth.oauth.errors.codeAlreadyUsed'),
        'OAUTH_CODE_ALREADY_USED',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (authCode.expiresAt < new Date()) {
      throw new AppException(
        this.i18n.t('auth.oauth.errors.codeExpired'),
        'OAUTH_CODE_EXPIRED',
        HttpStatus.BAD_REQUEST,
      );
    }

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

    authCode.usedAt = new Date();
    await this.authCodeRepository.save(authCode);

    const token = this.generateAccessToken();
    const expiresAt = new Date(Date.now() + this.tokenExpireSeconds * 1000);

    const accessToken = this.accessTokenRepository.create({
      token,
      clientId: authCode.clientId,
      userId: authCode.userId,
      scope: authCode.scope,
      expiresAt,
    });

    await this.accessTokenRepository.save(accessToken);

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

    const accessToken = await this.accessTokenRepository.findOne({
      where: { token, revokedAt: IsNull() },
    });

    if (!accessToken) {
      throw new AppException(
        this.i18n.t('auth.oauth.errors.invalidAccessToken'),
        'OAUTH_INVALID_ACCESS_TOKEN',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (accessToken.expiresAt < new Date()) {
      throw new AppException(
        this.i18n.t('auth.oauth.errors.accessTokenExpired'),
        'OAUTH_ACCESS_TOKEN_EXPIRED',
        HttpStatus.UNAUTHORIZED,
      );
    }

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

    if (scopes.includes('email') && user.email) {
      response.email = user.email;
    }

    return response;
  }

  async revokeToken(token: string): Promise<void> {
    const accessToken = await this.accessTokenRepository.findOne({
      where: { token },
    });

    if (accessToken) {
      accessToken.revokedAt = new Date();
      await this.accessTokenRepository.save(accessToken);
      this.logger.log(`Revoked access token for user ${accessToken.userId}`);
    }
  }

  // TODO: Schedule these cleanup methods via cron or expose as admin endpoints
  async cleanupExpiredCodes(): Promise<number> {
    const result = await this.authCodeRepository.delete({
      expiresAt: LessThan(new Date()),
    });
    return result.affected || 0;
  }

  async cleanupExpiredTokens(): Promise<number> {
    const result = await this.accessTokenRepository.delete({
      expiresAt: LessThan(new Date()),
    });
    return result.affected || 0;
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
