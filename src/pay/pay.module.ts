import { Module } from '@nestjs/common';
import { WeixinController } from 'omniboxd/pay/weixin.controller';
import { WeixinService } from 'omniboxd/pay/weixin.service';
import { AlipayController } from 'omniboxd/pay/alipay.controller';
import { AlipayService } from 'omniboxd/pay/alipay.service';
import { OrdersModule } from 'omniboxd/orders/orders.module';

@Module({
  imports: [OrdersModule],
  controllers: [WeixinController, AlipayController],
  providers: [WeixinService, AlipayService],
})
export class PayModule {}
