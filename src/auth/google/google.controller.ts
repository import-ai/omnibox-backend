import { Request, Response } from 'express';
import { AuthService } from 'omniboxd/auth/auth.service';
import { GoogleService } from 'omniboxd/auth/google/google.service';
import { Req, Res, Get, Body, Controller, Post, Query } from '@nestjs/common';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';
import { ConfigService } from '@nestjs/config';
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
      const jwtExpireSeconds = parseInt(
        this.configService.get('OBB_JWT_EXPIRE', '2678400'),
        10,
      );
      res.cookie('token', loginData.access_token, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        path: '/',
        maxAge: jwtExpireSeconds * 1000,
      });
    }

    return res.json(loginData);
  }

  @Post('unbind')
  unbind(@UserId() userId: string) {
    return this.googleService.unbind(userId);
  }
}
