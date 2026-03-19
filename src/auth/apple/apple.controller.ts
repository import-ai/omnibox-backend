import { Request, Response } from 'express';
import { AuthService } from 'omniboxd/auth/auth.service';
import { AppleService } from 'omniboxd/auth/apple/apple.service';
import { Req, Res, Get, Body, Controller, Post } from '@nestjs/common';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';
import { ConfigService } from '@nestjs/config';
import { SocialController } from 'omniboxd/auth/social.controller';
import { UserId } from 'omniboxd/decorators/user-id.decorator';

@Controller('api/v1/apple')
export class AppleController extends SocialController {
  constructor(
    private readonly appleService: AppleService,
    protected readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {
    super(authService);
  }

  @Public()
  @Get('available')
  available() {
    return this.appleService.available();
  }

  @Public()
  @Get('auth-config')
  getAuthConfig() {
    return this.appleService.getAuthConfig();
  }

  @Public()
  @Post('callback')
  async handleCallback(
    @Req() req: Request,
    @Res() res: Response,
    @Body()
    body: {
      id_token: string;
      state: string;
      user?: { name?: { firstName: string; lastName: string }; email?: string };
      lang?: string;
    },
  ) {
    const userId = this.findUserId(req.headers.authorization);

    const loginData = await this.appleService.handleCallback(
      body.id_token,
      body.state,
      body.user,
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

  @Public()
  @Post('mobile')
  async handleMobileCallback(
    @Req() req: Request,
    @Res() res: Response,
    @Body()
    body: {
      identity_token: string;
      authorization_code: string;
      user?: { name?: { firstName: string; lastName: string }; email?: string };
      username?: string;
      lang?: string;
    },
  ) {
    const userId = this.findUserId(req.headers.authorization);

    const loginData = await this.appleService.handleMobileCallback(
      body.identity_token,
      body.authorization_code,
      body.user,
      body.username,
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
    return this.appleService.unbind(userId);
  }
}
