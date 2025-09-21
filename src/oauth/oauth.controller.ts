import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Request,
  Response,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Response as ExpressResponse } from 'express';
import { OAuthService } from './oauth.service';
import { UserService } from 'omniboxd/user/user.service';
import { JwtAuthGuard } from 'omniboxd/auth/jwt-auth.guard';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';
import { AuthorizeApprovalDto, AuthorizeDto } from './dto/authorize.dto';
import { TokenDto, TokenErrorDto, TokenResponseDto } from './dto/token.dto';
import { ClientResponseDto, CreateClientDto } from './dto/create-client.dto';
import { UserId } from 'omniboxd/decorators/user-id.decorator';

@Controller('oauth')
export class OAuthController {
  constructor(
    private readonly oauthService: OAuthService,
    private readonly userService: UserService,
  ) {}

  @Get('authorize')
  @Public()
  async authorize(
    @Query() query: AuthorizeDto,
    @Request() req,
    @Response() res: ExpressResponse,
  ) {
    const {
      response_type,
      client_id,
      redirect_uri,
      scope = 'openid profile email',
      state,
      code_challenge,
      code_challenge_method,
    } = query;

    if (response_type !== 'code') {
      const errorUrl = new URL(redirect_uri);
      errorUrl.searchParams.set('error', 'unsupported_response_type');
      errorUrl.searchParams.set(
        'error_description',
        'Only authorization code flow is supported',
      );
      if (state) errorUrl.searchParams.set('state', state);
      return res.redirect(errorUrl.toString());
    }

    const client = await this.oauthService.getClient(client_id);
    if (!client) {
      const errorUrl = new URL(redirect_uri);
      errorUrl.searchParams.set('error', 'invalid_client');
      errorUrl.searchParams.set('error_description', 'Client not found');
      if (state) errorUrl.searchParams.set('state', state);
      return res.redirect(errorUrl.toString());
    }

    if (!this.oauthService.validateRedirectUri(client, redirect_uri)) {
      throw new BadRequestException('Invalid redirect URI');
    }

    const requestedScopes = scope.split(' ');
    if (!this.oauthService.validateScopes(client, requestedScopes)) {
      const errorUrl = new URL(redirect_uri);
      errorUrl.searchParams.set('error', 'invalid_scope');
      errorUrl.searchParams.set(
        'error_description',
        'Invalid or unsupported scope',
      );
      if (state) errorUrl.searchParams.set('state', state);
      return res.redirect(errorUrl.toString());
    }

    if (!req.user) {
      const loginUrl = `/api/v1/login?redirect=${encodeURIComponent(req.originalUrl)}`;
      return res.redirect(loginUrl);
    }

    return res.render('oauth/authorize', {
      client,
      scope: requestedScopes,
      redirect_uri,
      state,
      code_challenge,
      code_challenge_method,
    });
  }

  @Post('authorize')
  @UseGuards(JwtAuthGuard)
  async authorizeApproval(
    @Body() body: AuthorizeApprovalDto,
    @UserId() userId: string,
    @Response() res: ExpressResponse,
  ) {
    const {
      client_id,
      redirect_uri,
      scope = 'openid profile email',
      state,
      code_challenge,
      code_challenge_method,
      decision,
    } = body;

    const redirectUrl = new URL(redirect_uri);

    if (decision !== 'allow') {
      redirectUrl.searchParams.set('error', 'access_denied');
      redirectUrl.searchParams.set(
        'error_description',
        'User denied the request',
      );
      if (state) redirectUrl.searchParams.set('state', state);
      return res.redirect(redirectUrl.toString());
    }

    const client = await this.oauthService.getClient(client_id);
    if (!client) {
      redirectUrl.searchParams.set('error', 'invalid_client');
      if (state) redirectUrl.searchParams.set('state', state);
      return res.redirect(redirectUrl.toString());
    }

    try {
      const user = await this.userService.find(userId);
      const requestedScopes = scope.split(' ');
      const authorizationCode =
        await this.oauthService.generateAuthorizationCode(
          client,
          user,
          requestedScopes,
          redirect_uri,
          code_challenge,
          code_challenge_method,
        );

      redirectUrl.searchParams.set('code', authorizationCode);
      if (state) redirectUrl.searchParams.set('state', state);

      return res.redirect(redirectUrl.toString());
    } catch {
      redirectUrl.searchParams.set('error', 'invalid_request');
      if (state) redirectUrl.searchParams.set('state', state);
      return res.redirect(redirectUrl.toString());
    }
  }

  @Post('token')
  @Public()
  @HttpCode(200)
  async token(
    @Body() body: TokenDto,
  ): Promise<TokenResponseDto | TokenErrorDto> {
    const { grant_type } = body;

    try {
      if (grant_type === 'authorization_code') {
        return await this.handleAuthorizationCodeGrant(body);
      } else if (grant_type === 'refresh_token') {
        return await this.handleRefreshTokenGrant(body);
      } else {
        return {
          error: 'unsupported_grant_type',
          error_description: 'Grant type not supported',
        };
      }
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof UnauthorizedException
      ) {
        return {
          error: 'invalid_request',
          error_description: error.message,
        };
      }
      return {
        error: 'server_error',
        error_description: 'Internal server error',
      };
    }
  }

  private async handleAuthorizationCodeGrant(
    body: TokenDto,
  ): Promise<TokenResponseDto> {
    const { code, redirect_uri, client_id, client_secret, code_verifier } =
      body;

    if (!code || !redirect_uri || !client_id) {
      throw new BadRequestException('Missing required parameters');
    }

    const client = await this.oauthService.getClient(client_id, client_secret);
    if (!client) {
      throw new UnauthorizedException('Invalid client credentials');
    }

    const authCode = await this.oauthService.getAuthorizationCode(code);
    if (!authCode) {
      throw new BadRequestException('Invalid or expired authorization code');
    }

    if (authCode.clientId !== client.id) {
      throw new BadRequestException(
        'Authorization code was not issued to this client',
      );
    }

    if (authCode.redirectUri !== redirect_uri) {
      throw new BadRequestException('Redirect URI mismatch');
    }

    if (authCode.codeChallenge && code_verifier) {
      const isValidChallenge = this.oauthService.validateCodeChallenge(
        code_verifier,
        authCode.codeChallenge,
        authCode.codeChallengeMethod,
      );
      if (!isValidChallenge) {
        throw new BadRequestException('Invalid code verifier');
      }
    }

    await this.oauthService.revokeAuthorizationCode(code);

    const tokens = await this.oauthService.generateTokens(
      authCode.client,
      authCode.user,
      authCode.scopes,
      code,
    );

    return {
      access_token: tokens.accessToken,
      token_type: 'Bearer',
      expires_in: tokens.expiresIn,
      refresh_token: tokens.refreshToken,
      scope: authCode.scopes.join(' '),
    };
  }

  private async handleRefreshTokenGrant(
    body: TokenDto,
  ): Promise<TokenResponseDto> {
    const { refresh_token, client_id, client_secret, scope } = body;

    if (!refresh_token || !client_id) {
      throw new BadRequestException('Missing required parameters');
    }

    const client = await this.oauthService.getClient(client_id, client_secret);
    if (!client) {
      throw new UnauthorizedException('Invalid client credentials');
    }

    const tokenRecord = await this.oauthService.getRefreshToken(refresh_token);
    if (!tokenRecord) {
      throw new BadRequestException('Invalid or expired refresh token');
    }

    if (tokenRecord.clientId !== client.id) {
      throw new BadRequestException(
        'Refresh token was not issued to this client',
      );
    }

    await this.oauthService.revokeToken(tokenRecord.id);

    let scopes = tokenRecord.scopes;
    if (scope) {
      const requestedScopes = scope.split(' ');
      if (!this.oauthService.validateScopes(client, requestedScopes)) {
        throw new BadRequestException('Invalid scope');
      }
      scopes = requestedScopes;
    }

    const tokens = await this.oauthService.generateTokens(
      tokenRecord.client,
      tokenRecord.user,
      scopes,
    );

    return {
      access_token: tokens.accessToken,
      token_type: 'Bearer',
      expires_in: tokens.expiresIn,
      refresh_token: tokens.refreshToken,
      scope: scopes.join(' '),
    };
  }

  @Get('userinfo')
  @Public()
  async userinfo(@Request() req): Promise<any> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Bearer token required');
    }

    const accessToken = authHeader.substring(7);
    const tokenRecord = await this.oauthService.getAccessToken(accessToken);

    if (!tokenRecord) {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    const user = tokenRecord.user;
    const scopes = tokenRecord.scopes;

    const userInfo: any = {};

    if (scopes.includes('openid')) {
      userInfo.sub = user.id;
    }

    if (scopes.includes('profile')) {
      userInfo.name = user.username;
      userInfo.preferred_username = user.username;
    }

    if (scopes.includes('email')) {
      userInfo.email = user.email;
      userInfo.email_verified = true;
    }

    return userInfo;
  }

  @Post('clients')
  @UseGuards(JwtAuthGuard)
  async createClient(
    @Body() createClientDto: CreateClientDto,
    @Request() req,
  ): Promise<ClientResponseDto> {
    const { clientId, clientSecret, client } =
      await this.oauthService.createClient(
        createClientDto.name,
        createClientDto.redirect_uris,
        req.user.id,
        {
          description: createClientDto.description,
          scopes: createClientDto.scopes,
          grants: createClientDto.grants,
          isConfidential: createClientDto.is_confidential,
          logoUrl: createClientDto.logo_url,
          websiteUrl: createClientDto.website_url,
          privacyPolicyUrl: createClientDto.privacy_policy_url,
          termsOfServiceUrl: createClientDto.terms_of_service_url,
        },
      );

    return {
      client_id: clientId,
      client_secret: client.isConfidential ? clientSecret : undefined,
      name: client.name,
      description: client.description,
      redirect_uris: client.redirectUris,
      scopes: client.scopes,
      grants: client.grants,
      is_confidential: client.isConfidential,
      logo_url: client.logoUrl,
      website_url: client.websiteUrl,
      privacy_policy_url: client.privacyPolicyUrl,
      terms_of_service_url: client.termsOfServiceUrl,
      created_at: client.createdAt,
    };
  }
}
