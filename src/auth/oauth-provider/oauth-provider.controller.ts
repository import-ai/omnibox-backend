import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Headers,
  HttpStatus,
} from '@nestjs/common';
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
import { CookieAuth, Public } from 'omniboxd/auth/decorators';
import { UserId } from 'omniboxd/decorators/user-id.decorator';

@ApiTags('OAuth Provider')
@Controller('api/v1/oauth')
export class OAuthProviderController {
  constructor(private readonly oauthService: OAuthProviderService) {}

  @Get('authorize')
  @CookieAuth()
  @ApiOperation({
    summary: 'OAuth Authorization Endpoint',
    description:
      'Returns redirect URL for OAuth authorization flow. Returns 401 if not authenticated.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns redirect URL with authorization code',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'User not authenticated',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid client_id, redirect_uri, or scope',
  })
  async authorize(
    @Query() dto: AuthorizeRequestDto,
    @UserId() userId: string,
  ): Promise<{ redirect_url: string }> {
    const { redirectUrl } = await this.oauthService.authorize(dto, userId);
    return { redirect_url: redirectUrl };
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
