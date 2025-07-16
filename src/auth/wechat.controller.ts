import { WechatService } from './wechat.service';
import { Public } from 'src/auth/decorators/public.decorator';
import { Get, Param, Query, Controller } from '@nestjs/common';
import {
  WechatQrcodeResponseDto,
  WechatCheckResponseDto,
} from './dto/wechat-login.dto';

@Controller('api/v1/wechat')
export class WechatController {
  constructor(private readonly wechatService: WechatService) {}

  @Public()
  @Get('qrcode')
  async getQrCode(): Promise<WechatQrcodeResponseDto> {
    return await this.wechatService.generateQrCode();
  }

  @Public()
  @Get('check/:state')
  checkStatus(@Param('state') state: string): WechatCheckResponseDto {
    return this.wechatService.checkQrCodeStatus(state);
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
