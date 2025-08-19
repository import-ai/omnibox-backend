import { Request } from 'express';
import { Get, Post, Query, Controller, Req } from '@nestjs/common';
import { AuthService } from 'omniboxd/auth/auth.service';
import { WechatService } from 'omniboxd/auth/wechat.service';
import { SocialController } from 'omniboxd/auth/social.controller';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';
import { UserId } from 'omniboxd/decorators/user-id.decorator';

@Controller('api/v1/wechat')
export class WechatController extends SocialController {
  constructor(
    private readonly wechatService: WechatService,
    protected readonly authService: AuthService,
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
  getAuthUrl() {
    return this.wechatService.authUrl();
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
    @Query('code') code: string,
    @Query('state') state: string,
  ) {
    const userId = this.findUserId(req.headers.authorization);
    return await this.wechatService.handleCallback(code, state, userId);
  }

  @Post('unbind')
  unbind(@UserId() userId: string) {
    return this.wechatService.unbind(userId);
  }
}
