import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WeChatPayModule } from 'nest-wechatpay-node-v3';
import { WeixinController } from 'omniboxd/pay/weixin.controller';
import { WeixinService } from 'omniboxd/pay/weixin.service';
import { AlipayController } from 'omniboxd/pay/alipay.controller';
import { AlipayService } from 'omniboxd/pay/alipay.service';
import { OrdersModule } from 'omniboxd/orders/orders.module';
import { UserModule } from 'omniboxd/user/user.module';

@Module({
  imports: [
    OrdersModule,
    UserModule,
    WeChatPayModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        return {
          key: configService.get<string>('OBB_WECHAT_APP_KEY', ''),
          appid: configService.get<string>('OBB_WECHAT_PAY_APPID', ''),
          mchid: configService.get<string>('OBB_WECHAT_PAY_MCHID', ''),
          serial_no: configService.get<string>('OBB_WECHAT_PAY_SERIAL', ''),
          publicKey: Buffer.from(
            configService.get<string>('OBB_WECHAT_PAY_CERT', ''),
            'base64',
          ),
          privateKey: Buffer.from(
            configService.get<string>('OBB_WECHAT_PAY_KEY', ''),
            'base64',
          ),
        };
      },
    }),
  ],
  controllers: [WeixinController, AlipayController],
  providers: [WeixinService, AlipayService],
})
export class PayModule {}
