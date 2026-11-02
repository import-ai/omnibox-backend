import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { AuthService } from 'omniboxd/auth/auth.service';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';
import { GoogleService } from 'omniboxd/auth/google/google.service';
import {
  getSessionCookieMaxAge,
  setSessionCookie,
} from 'omniboxd/auth/session-cookie';
import { SocialController } from 'omniboxd/auth/social.controller';
import { UserId } from 'omniboxd/decorators/user-id.decorator';

@Controller('api/v1/google')
export class GoogleController extends SocialController {
  constructor(
    private readonly googleService: GoogleService,
    protected readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {
    super(authService);
  }

  @Public()
  @Get('available')
  available() {
    return this.googleService.available();
  }

  @Public()
  @Get('auth-url')
  getAuthUrl(@Query('redirect') redirect?: string) {
    return this.googleService.authUrl(redirect);
  }

  @Public()
  @Post('callback')
  async handleCallback(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: { code: string; state: string; lang?: string },
  ) {
    const userId = this.findUserId(req.headers.authorization);

    const loginData = await this.googleService.handleCallback(
      body.code,
      body.state,
      userId,
      body.lang,
    );

    if (loginData && loginData.access_token) {
      setSessionCookie(
        req,
        res,
        loginData.access_token,
        getSessionCookieMaxAge(this.configService),
      );
    }

    return res.json(loginData);
  }

  @Public()
  @Post('mobile')
  async handleMobileCallback(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: { id_token: string; lang?: string },
  ) {
    const userId = this.findUserId(req.headers.authorization);

    const loginData = await this.googleService.handleMobileCallback(
      body.id_token,
      userId,
      body.lang,
    );

    if (loginData && loginData.access_token) {
      setSessionCookie(
        req,
        res,
        loginData.access_token,
        getSessionCookieMaxAge(this.configService),
      );
    }

    return res.json(loginData);
  }

  @Post('unbind')
  unbind(@UserId() userId: string) {
    return this.googleService.unbind(userId);
  }
}
