import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Headers,
  Res,
  Req,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { OAuthProviderService } from './oauth-provider.service';
import { OAuthClientService } from './oauth-client.service';
import { AuthorizeRequestDto } from './dto/authorize-request.dto';
import { TokenRequestDto, TokenResponseDto } from './dto/token-request.dto';
import { UserinfoResponseDto } from './dto/userinfo-response.dto';
import {
  CreateClientRequestDto,
  CreateClientResponseDto,
} from './dto/create-client-request.dto';
import { Public } from 'omniboxd/auth/decorators';

@ApiTags('OAuth Provider')
@Controller('api/v1/oauth')
export class OAuthProviderController {
  constructor(
    private readonly oauthService: OAuthProviderService,
    private readonly jwtService: JwtService,
  ) {}

  @Get('authorize')
  @Public()
  @ApiOperation({
    summary: 'OAuth Authorization Endpoint',
    description:
      'Initiates the OAuth authorization flow. Redirects to login if not authenticated.',
  })
  @ApiResponse({
    status: HttpStatus.FOUND,
    description: 'Redirects to client with authorization code or to login page',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid client_id, redirect_uri, or scope',
  })
  async authorize(
    @Query() dto: AuthorizeRequestDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // Try to get user from cookie token
    const token = req.cookies?.token;
    let userId: string | null = null;

    if (token) {
      try {
        const payload = this.jwtService.verify(token);
        if (payload?.sub) {
          userId = payload.sub;
        }
      } catch {
        // Token invalid or expired, will redirect to login
      }
    }

    // If not authenticated, redirect to login with return URL
    if (!userId) {
      // Build absolute URL for the OAuth return redirect
      const protocol = req.protocol;
      const host = req.get('host');
      const currentUrl = `${protocol}://${host}${req.originalUrl}`;
      // Use relative path - works when frontend/backend share same origin via reverse proxy
      const loginUrl = `/user/login?redirect=${encodeURIComponent(currentUrl)}`;
      return res.redirect(HttpStatus.FOUND, loginUrl);
    }

    const { redirectUrl } = await this.oauthService.authorize(dto, userId);
    res.redirect(HttpStatus.FOUND, redirectUrl);
  }

  @Post('token')
  @Public()
  @ApiOperation({
    summary: 'OAuth Token Endpoint',
    description: 'Exchanges authorization code for access token',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Access token issued',
    type: TokenResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid code, client, or redirect_uri',
  })
  async token(@Body() dto: TokenRequestDto): Promise<TokenResponseDto> {
    return this.oauthService.exchangeToken(dto);
  }

  @Get('userinfo')
  @Public()
  @ApiOperation({
    summary: 'OAuth UserInfo Endpoint',
    description: 'Returns user information for the authenticated access token',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User information',
    type: UserinfoResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Invalid or expired access token',
  })
  async userinfo(
    @Headers('authorization') authorization: string,
  ): Promise<UserinfoResponseDto> {
    return this.oauthService.getUserinfo(authorization);
  }

  @Post('revoke')
  @Public()
  @ApiOperation({
    summary: 'OAuth Token Revocation Endpoint',
    description: 'Revokes an access token',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Token revoked successfully',
  })
  async revoke(@Body('token') token: string): Promise<{ revoked: boolean }> {
    await this.oauthService.revokeToken(token);
    return { revoked: true };
  }
}

@ApiTags('OAuth Clients')
@Controller('internal/api/v1/oauth/clients')
export class OAuthClientController {
  constructor(private readonly clientService: OAuthClientService) {}

  @Post()
  @Public()
  @ApiOperation({
    summary: 'Create OAuth Client',
    description: 'Registers a new OAuth client application. Internal use only.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'OAuth client created',
    type: CreateClientResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Client with this ID already exists',
  })
  async createClient(
    @Body() dto: CreateClientRequestDto,
  ): Promise<CreateClientResponseDto> {
    return this.clientService.create(dto);
  }
}
