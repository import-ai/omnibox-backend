import { AlipayCallbackQuery } from 'omniboxd/pay/types';
import { AlipayService } from 'omniboxd/pay/alipay.service';
import { Get, Post, Param, Query, Controller } from '@nestjs/common';
import { UserId } from 'omniboxd/decorators/user-id.decorator';

@Controller('api/v1/pay/alipay')
export class AlipayController {
  constructor(private readonly alipayService: AlipayService) {}

  @Post('transactions/:type/:productId')
  transactions(
    @UserId() userId: string,
    @Param('type') type: 'native' | 'h5',
    @Param('productId') productId: string,
    @Query('returnUrl') returnUrl: string,
  ) {
    return this.alipayService.transactions(userId, type, productId, returnUrl);
  }

  @Post('callback')
  callback(@Query() query: AlipayCallbackQuery) {
    return this.alipayService.callback(query);
  }

  @Get('query/:orderId')
  async query(@UserId() userId: string, @Param('orderId') orderId: string) {
    return await this.alipayService.query(userId, orderId);
  }
}
