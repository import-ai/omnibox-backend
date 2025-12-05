import { Request, Response } from 'express';
import { Get, Post, Query, Body, Controller, Req, Res } from '@nestjs/common';
import { AuthService } from 'omniboxd/auth/auth.service';
import {
  WechatService,
  WechatUserInfo,
} from 'omniboxd/auth/wechat/wechat.service';
import { SocialController } from 'omniboxd/auth/social.controller';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';
import { ConfigService } from '@nestjs/config';
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
  ) {
    // 兼容旧的isH5参数
    const finalSource = source || (isH5 ? 'h5' : 'web');
    return this.wechatService.authUrl(finalSource, h5Redirect);
  }

  @Public()
  @Get('qrcode')
  getQrCode() {
    return this.wechatService.getQrCodeParams();
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

    // 返回登录数据，包含source和h5_redirect信息
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
