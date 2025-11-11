import fs from 'fs';
import { AlipaySdk } from 'alipay-sdk';
import { ConfigService } from '@nestjs/config';
import { OrdersService } from 'omniboxd/orders/orders.service';
import { Injectable, BadRequestException } from '@nestjs/common';
import {
  PaymentMethod,
  PaymentType,
  OrderStatus,
} from 'omniboxd/orders/entities/order.entity';
import {
  AlipayCallbackQuery,
  AlipayQueryResponse,
  AlipayTradeStatus,
} from 'omniboxd/pay/types';
import { I18nService } from 'nestjs-i18n';

@Injectable()
export class AlipayService {
  private pay: AlipaySdk;

  constructor(
    private configService: ConfigService,
    private ordersService: OrdersService,
    private readonly i18n: I18nService,
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
      paymentMethod: PaymentMethod.ALIPAY,
      paymentType: type === 'h5' ? PaymentType.H5 : PaymentType.NATIVE,
    });
    const baseURL = this.configService.get<string>(
      'OBB_BASE_URL',
      'https://www.omnibox.pro',
    );
    const notifyUrl = `${baseURL}/api/v1/pay/alipay/callback`;
    const returnUrl = this.configService.get<string>(
      'OBB_ALIPAY_RETURN_URL',
      'https://www.omnibox.pro',
    );
    const amountInYuan = (order.amount / 100).toFixed(2);

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
    throw new BadRequestException(this.i18n.t('pay.errors.invalidParameter'));
  }

  async callback(query: AlipayCallbackQuery) {
    if (!this.pay.checkNotifySign(query)) {
      throw new BadRequestException(
        this.i18n.t('pay.errors.signatureVerificationFailed'),
      );
    }

    const { out_trade_no, trade_no, trade_status, total_amount } = query;

    if (!out_trade_no || !trade_no) {
      throw new BadRequestException(
        this.i18n.t('pay.errors.missingRequiredParameters'),
      );
    }

    const order = await this.ordersService.findByOrderNo(out_trade_no);

    const orderAmountInYuan = (order.amount / 100).toFixed(2);
    if (total_amount !== orderAmountInYuan) {
      throw new BadRequestException(
        this.i18n.t('pay.errors.orderAmountMismatch'),
      );
    }

    if (trade_status === 'TRADE_SUCCESS' || trade_status === 'TRADE_FINISHED') {
      await this.ordersService.markAsPaid(out_trade_no, trade_no);
    } else if (trade_status === 'TRADE_CLOSED') {
      await this.ordersService.close(out_trade_no);
    }

    return 'success';
  }

  async query(userId: string, orderId: string) {
    const order = await this.ordersService.findById(userId, orderId);
    const response = await this.pay.curl('POST', '/alipay/trade/query', {
      body: {
        out_trade_no: order.orderNo,
        query_options: ['trade_settle_info'],
      },
    });
    const alipayData = response.data
      .alipay_trade_query_response as unknown as AlipayQueryResponse;

    if (
      (alipayData.trade_status === AlipayTradeStatus.TRADE_SUCCESS ||
        alipayData.trade_status === AlipayTradeStatus.TRADE_FINISHED) &&
      order.status !== OrderStatus.PAID
    ) {
      const orderAmountInYuan = (order.amount / 100).toFixed(2);
      if (alipayData.total_amount !== orderAmountInYuan) {
        throw new BadRequestException(
          this.i18n.t('pay.errors.orderAmountMismatch'),
        );
      }

      await this.ordersService.markAsPaid(order.orderNo, alipayData.trade_no);
    }

    if (
      alipayData.trade_status === AlipayTradeStatus.TRADE_CLOSED &&
      order.status !== OrderStatus.CLOSED &&
      order.status !== OrderStatus.PAID
    ) {
      await this.ordersService.close(order.orderNo);
    }

    return await this.ordersService.findById(userId, orderId);
  }
}
