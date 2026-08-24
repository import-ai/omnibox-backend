import { Controller, Get, Query } from '@nestjs/common';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';

import { WechatJsSdkService } from './wechat-js-sdk.service';

@Controller('api/v1/wechat/js-sdk')
export class WechatJsSdkController {
  constructor(private readonly wechatJsSdkService: WechatJsSdkService) {}

  @Public()
  @Get('signature')
  createSignature(@Query('url') pageUrl: string) {
    return this.wechatJsSdkService.createSignature(pageUrl);
  }
}
