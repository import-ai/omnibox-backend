import { Request } from 'express';
import { WeixinCallbackBody } from 'omniboxd/pay/types';
import { WeixinService } from 'omniboxd/pay/weixin.service';
import {
  Req,
  Get,
  Post,
  Param,
  Body,
  Controller,
  BadRequestException,
} from '@nestjs/common';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { getClientPublicIp } from 'omniboxd/pay/utils';
import { I18nService } from 'nestjs-i18n';

@Controller('api/v1/pay/weixin')
export class WeixinController {
  constructor(
    private readonly weixinService: WeixinService,
    private readonly i18n: I18nService,
  ) {}

  @Post('transactions/:type/:productId')
  async transactions(
    @Req() req: Request,
    @UserId() userId: string,
    @Param('type') type: 'native' | 'jsapi' | 'h5',
    @Param('productId') productId: string,
  ) {
    const clientIP = getClientPublicIp(req);
    if (!clientIP) {
      throw new BadRequestException(this.i18n.t('pay.errors.cannotGetUserIP'));
    }

    return await this.weixinService.transactions(
      userId,
      type,
      productId,
      clientIP,
    );
  }

  @Post('callback')
  callback(@Body() body: WeixinCallbackBody) {
    return this.weixinService.callback(body);
  }

  @Get('query/:orderId')
  async query(@UserId() userId: string, @Param('orderId') orderId: string) {
    return await this.weixinService.query(userId, orderId);
  }
}
