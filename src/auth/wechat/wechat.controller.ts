import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { AuthService } from 'omniboxd/auth/auth.service';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';
import { SocialController } from 'omniboxd/auth/social.controller';
import {
  WechatService,
  WechatUserInfo,
} from 'omniboxd/auth/wechat/wechat.service';
import { UserId } from 'omniboxd/decorators/user-id.decorator';

@Controller('api/v1/wechat')
export class WechatController extends SocialController {
  constructor(
    private readonly wechatService: WechatService,
    protected readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {
    super(authService);
  }

  @Public()
  @Get('available')
  available() {
    return this.wechatService.available();
  }

  @Public()
  @Get('auth-url')
  getAuthUrl(
    @Query('isH5') isH5?: boolean,
    @Query('source') source?: 'h5' | 'web',
    @Query('h5_redirect') h5Redirect?: string,
    @Query('redirect') redirect?: string,
    @Query('device_token') deviceToken?: string,
  ) {
    const finalSource = source || (isH5 ? 'h5' : 'web');
    return this.wechatService.authUrl(
      finalSource,
      h5Redirect,
      redirect,
      deviceToken,
    );
  }

  @Public()
  @Get('check')
  checkState(
    @Query('state') state: string,
    @Query('device_token') deviceToken?: string,
  ) {
    return this.wechatService.checkState(state, deviceToken);
  }

  @Public()
  @Post('check/complete-mini-program')
  completeMiniProgramState(
    @Body('state') state: string,
    @Body('code') code: string,
    @Body('lang') lang?: string,
    @Body('device_token') deviceToken?: string,
  ) {
    return this.wechatService.completeMiniProgramState(
      state,
      code,
      lang,
      deviceToken,
    );
  }

  @Public()
  @Post('login/native')
  async nativeLogin(
    @Req() req: Request,
    @Res() res: Response,
    @Body('code') code: string,
    @Body('source') source?: string,
    @Body('lang') lang?: string,
  ) {
    const loginData = await this.wechatService.nativeLogin(code, source, lang);

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
  @Post('login/mini_program')
  async miniProgramLogin(
    @Req() req: Request,
    @Res() res: Response,
    @Body('code') code: string,
    @Body('lang') lang?: string,
  ) {
    const loginData = await this.wechatService.miniProgramLogin(code, lang);

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
  @Get('qrcode')
  getQrCode(@Query('redirect') redirect?: string) {
    return this.wechatService.getQrCodeParams(redirect);
  }

  @Public()
  @Get('callback')
  async handleCallback(
    @Req() req: Request,
    @Res() res: Response,
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('lang') lang?: string,
  ) {
    const userId = this.findUserId(req.headers.authorization);
    const loginData = await this.wechatService.handleCallback(
      code,
      state,
      userId,
      lang,
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
  @Get('migration/auth-url')
  migrationAuthUrl(@Query('type') type: 'new' | 'old' = 'new') {
    return this.wechatService.migrationAuthUrl(type);
  }

  @Public()
  @Get('migration/qrcode')
  migrationQrCode(@Query('type') type: 'new' | 'old' = 'new') {
    return this.wechatService.migrationQrCode(type);
  }

  @Public()
  @Get('migration/callback')
  async migrationCallback(
    @Query('code') code: string,
    @Query('state') state: string,
  ): Promise<WechatUserInfo> {
    return await this.wechatService.migrationCallback(code, state);
  }

  @Public()
  @Post('migration')
  async migration(
    @Body('oldUnionid') oldUnionid: string,
    @Body('newUnionid') newUnionid: string,
  ) {
    await this.wechatService.migration(oldUnionid, newUnionid);
  }

  @Post('unbind')
  unbind(@UserId() userId: string) {
    return this.wechatService.unbind(userId);
  }
}
