import { WeixinCallbackBody } from 'omniboxd/pay/types';
import { PayService } from 'omniboxd/pay/pay.service';
import { Get, Post, Param, Body, Controller } from '@nestjs/common';
import { UserId } from 'omniboxd/decorators/user-id.decorator';

@Controller('api/v1/pay')
export class PayController {
  constructor(private readonly payService: PayService) {}

  @Post('weixin/transactions/:type/:productId')
  async weixinTransactions(
    @UserId() userId: string,
    @Param('type') type: 'native' | 'jsapi' | 'h5',
    @Param('productId') productId: string,
  ) {
    return await this.payService.weixinTransactions(userId, type, productId);
  }

  @Post('weixin/callback')
  weixinCallback(@Body() response: WeixinCallbackBody) {
    return this.payService.weixinCallback(response);
  }

  @Get('weixin/query/:orderId')
  async weixinQuery(
    @UserId() userId: string,
    @Param('orderId') orderId: string,
  ) {
    return await this.payService.weixinQuery(userId, orderId);
  }

  // @Post('alipay/transactions/:type/:productId')
  // async alipayTransactions(
  //   @UserId() userId: string,
  //   @Param('type') type: 'native' | 'h5',
  //   @Param('productId') productId: string,
  // ) {
  //   return await this.payService.alipayTransactions(userId, type, productId);
  // }

  // @Post('alipay/callback')
  // async alipayCallback(@UserId() userId: string) {
  //   return await this.payService.alipayCallback(userId);
  // }

  // @Get('alipay/query')
  // async alipayQuery(@UserId() userId: string) {
  //   return await this.payService.alipayQuery(userId);
  // }
}
