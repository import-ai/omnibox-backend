import fs from 'fs';
import { AlipaySdk } from 'alipay-sdk';
import { ConfigService } from '@nestjs/config';
import { AlipayCallbackQuery } from 'omniboxd/pay/types';
import { Injectable, BadRequestException } from '@nestjs/common';
import { OrdersService } from 'omniboxd/orders/orders.service';
import {
  PaymentMethod,
  PaymentType,
} from 'omniboxd/orders/entities/order.entity';

@Injectable()
export class AlipayService {
  private pay: AlipaySdk;

  constructor(
    private readonly configService: ConfigService,
    private readonly ordersService: OrdersService,
  ) {
    this.pay = new AlipaySdk({
      appId: this.configService.get<string>('OBB_ALIPAY_APPID', ''),
      alipayPublicKey: fs.readFileSync(
        this.configService.get<string>('OBB_ALIPAY_CERT_PATH', ''),
        'ascii',
      ),
      privateKey: fs.readFileSync(
        this.configService.get<string>('OBB_ALIPAY_KEY_PATH', ''),
        'ascii',
      ),
    });
  }

  async transactions(userId: string, type: 'native' | 'h5', productId: string) {
    const order = await this.ordersService.create(userId, {
      productId,
      amount: 1, // TODO: 根据 productId 获取实际金额
      description: '产品购买', // TODO: 根据 productId 获取产品描述
      paymentMethod: PaymentMethod.ALIPAY,
      paymentType: type === 'h5' ? PaymentType.H5 : PaymentType.NATIVE,
    });

    const notifyUrl = this.configService.get<string>(
      'OBB_ALIPAY_NOTIFY_URL',
      '',
    );
    const returnUrl = this.configService.get<string>(
      'OBB_ALIPAY_RETURN_URL',
      'https://www.omnibox.pro',
    );
    const amountInYuan = (order.amount / 100).toFixed(2); // 将分转换为元

    if (type === 'h5') {
      const url = this.pay.pageExecute('alipay.trade.wap.pay', 'GET', {
        notifyUrl,
        returnUrl,
        bizContent: {
          out_trade_no: order.orderNo,
          total_amount: amountInYuan,
          subject: order.description,
          product_code: 'QUICK_WAP_WAY',
        },
      });
      return { url, orderId: order.id, orderNo: order.orderNo };
    }
    if (type === 'native') {
      const url = this.pay.pageExecute('alipay.trade.page.pay', 'GET', {
        notifyUrl,
        returnUrl,
        bizContent: {
          out_trade_no: order.orderNo,
          total_amount: amountInYuan,
          subject: order.description,
          product_code: 'FAST_INSTANT_TRADE_PAY',
          qr_pay_mode: 2,
          integration_type: 'PCWEB',
        },
      });
      return { url, orderId: order.id, orderNo: order.orderNo };
    }
    throw new BadRequestException('参数错误');
  }

  async callback(query: AlipayCallbackQuery) {
    // 验证签名
    if (!this.pay.checkNotifySign(query)) {
      throw new BadRequestException('签名验证失败');
    }

    const { out_trade_no, trade_no, trade_status, total_amount } = query;

    if (!out_trade_no || !trade_no) {
      throw new BadRequestException('缺少必要参数');
    }

    // 获取订单
    const order = await this.ordersService.findByOrderNo(out_trade_no);

    // 验证金额
    const orderAmountInYuan = (order.amount / 100).toFixed(2);
    if (total_amount !== orderAmountInYuan) {
      throw new BadRequestException('订单金额不匹配');
    }

    // 根据支付状态更新订单
    if (trade_status === 'TRADE_SUCCESS' || trade_status === 'TRADE_FINISHED') {
      await this.ordersService.markAsPaid(out_trade_no, trade_no);
    } else if (trade_status === 'TRADE_CLOSED') {
      await this.ordersService.close(out_trade_no);
    }

    return 'success';
  }

  async query(userId: string, orderId: string) {
    // 查询本地订单
    const order = await this.ordersService.findById(userId, orderId);

    // 查询支付宝订单状态
    const data = await this.pay.curl('POST', '/alipay/trade/query', {
      body: {
        out_trade_no: order.orderNo,
        query_options: ['trade_settle_info'],
      },
    });

    return {
      order,
      alipayData: data,
    };
  }
}
