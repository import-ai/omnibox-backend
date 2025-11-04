import { WeixinCallbackBody } from 'omniboxd/pay/types';
import { WeixinService } from 'omniboxd/pay/weixin.service';
import { Get, Post, Param, Body, Controller } from '@nestjs/common';
import { UserId } from 'omniboxd/decorators/user-id.decorator';

@Controller('api/v1/pay/weixin')
export class WeixinController {
  constructor(private readonly weixinService: WeixinService) {}

  @Post('transactions/:type/:productId')
  async transactions(
    @UserId() userId: string,
    @Param('type') type: 'native' | 'jsapi' | 'h5',
    @Param('productId') productId: string,
  ) {
    return await this.weixinService.transactions(userId, type, productId);
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
