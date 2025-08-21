import { Response } from 'express';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { OAuthService } from 'omniboxd/oauth2/oauth.service';
import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Res,
  BadRequestException,
} from '@nestjs/common';

@Controller('api/v1/oauth2')
export class OAuthController {
  constructor(private readonly oauthService: OAuthService) {}

  @Get('authorize')
  authorize(
    @Query('response_type') responseType: string,
    @Query('client_id') clientId: string,
    @Query('redirect_uri') redirectUri: string,
    @Query('state') state: string,
    @UserId() userId: string,
    @Res() res: Response,
  ) {
    if (responseType !== 'code') {
      throw new BadRequestException(
        'Only authorization code flow is supported',
      );
    }

    if (!clientId || !redirectUri) {
      throw new BadRequestException('client_id and redirect_uri are required');
    }

    const code = this.oauthService.createAuthorizationCode(
      userId,
      clientId,
      redirectUri,
    );

    const redirectUrl = new URL(redirectUri);
    redirectUrl.searchParams.set('code', code);
    if (state) {
      redirectUrl.searchParams.set('state', state);
    }

    res.redirect(redirectUrl.toString());
  }

  @Public()
  @Post('token')
  async token(
    @Body()
    body: {
      grant_type: string;
      code: string;
      client_id: string;
    },
  ) {
    if (body.grant_type !== 'authorization_code') {
      throw new BadRequestException(
        'Only authorization_code grant type is supported',
      );
    }

    const { code, client_id } = body;
    if (!code || !client_id) {
      throw new BadRequestException('Missing required parameters');
    }

    return await this.oauthService.exchangeCodeForTokens(code, client_id);
  }
}
