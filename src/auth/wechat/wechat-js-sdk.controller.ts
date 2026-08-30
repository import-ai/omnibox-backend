import { Controller, Get, Header, Query } from '@nestjs/common';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';

import { WechatJsSdkService } from './wechat-js-sdk.service';

@Controller('api/v1/wechat')
export class WechatJsSdkController {
  constructor(private readonly wechatJsSdkService: WechatJsSdkService) {}

  @Public()
  @Get(['js-sdk/signature', 'js-sdk-signature'])
  @Header('Cache-Control', 'no-store')
  createSignature(@Query('url') pageUrl?: string) {
    return this.wechatJsSdkService.createSignature(pageUrl);
  }
}
