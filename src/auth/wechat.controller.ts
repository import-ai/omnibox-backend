import { WechatService } from './wechat.service';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';
import { Get, Query, Controller } from '@nestjs/common';

@Controller('api/v1/wechat')
export class WechatController {
  constructor(private readonly wechatService: WechatService) {}

  @Public()
  @Get('qrcode')
  getQrCode() {
    return this.wechatService.getQrCodeParams();
  }

  @Public()
  @Get('callback')
  async handleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
  ) {
    return await this.wechatService.handleCallback(code, state);
  }

  @Public()
  @Get('auth-url')
  getAuthUrl() {
    return this.wechatService.getWechatAuthUrl();
  }
}
