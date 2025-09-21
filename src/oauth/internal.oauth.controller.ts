import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { OAuthService } from './oauth.service';
import { JwtAuthGuard } from 'omniboxd/auth/jwt-auth.guard';
import { ClientResponseDto, CreateClientDto } from './dto/create-client.dto';
import { UserId } from 'omniboxd/decorators/user-id.decorator';

@Controller('internal/api/v1/oauth')
export class InternalOAuthController {
  constructor(private readonly oauthService: OAuthService) {}

  @Post('clients')
  @UseGuards(JwtAuthGuard)
  async createClient(
    @Body() createClientDto: CreateClientDto,
    @UserId() userId: string,
  ): Promise<ClientResponseDto> {
    const { clientId, clientSecret, client } =
      await this.oauthService.createClient(
        createClientDto.name,
        createClientDto.redirect_uris,
        userId,
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
