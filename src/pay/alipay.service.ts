import { AlipaySdk } from 'alipay-sdk';
import { ConfigService } from '@nestjs/config';
import { OrdersService } from 'omniboxd/orders/orders.service';
import { Injectable, HttpStatus } from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
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
      alipayPublicKey: this.configService.get<string>('OBB_ALIPAY_CERT', ''),
      privateKey: this.configService.get<string>('OBB_ALIPAY_KEY', ''),
    });
  }

  async transactions(
    userId: string,
    type: 'native' | 'h5',
    productId: string,
    returnUrl: string,
  ) {
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
    const amountInYuan = (order.amount / 100).toFixed(2);
    const redirectUrl = `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}orderId=${order.id}`;

    if (type === 'h5') {
      const url = this.pay.pageExecute('alipay.trade.wap.pay', 'GET', {
        notifyUrl,
        returnUrl: redirectUrl,
        bizContent: {
          out_trade_no: order.orderNo,
          total_amount: amountInYuan,
          subject: order.description,
          product_code: 'QUICK_WAP_WAY',
        },
      });
      return { url, orderId: order.id };
    }
    if (type === 'native') {
      const url = this.pay.pageExecute('alipay.trade.page.pay', 'GET', {
        notifyUrl,
        returnUrl: redirectUrl,
        bizContent: {
          out_trade_no: order.orderNo,
          total_amount: amountInYuan,
          subject: order.description,
          product_code: 'FAST_INSTANT_TRADE_PAY',
          qr_pay_mode: 2,
          integration_type: 'PCWEB',
        },
      });
      return { url, orderId: order.id };
    }
    throw new AppException(
      this.i18n.t('pay.errors.invalidParameter'),
      'INVALID_PARAMETER',
      HttpStatus.BAD_REQUEST,
    );
  }

  callback(query: AlipayCallbackQuery) {
    if (!this.pay.checkNotifySign(query)) {
      return 'failure';
    }

    const { out_trade_no, trade_no, trade_status, total_amount } = query;

    if (!out_trade_no || !trade_no) {
      return 'failure';
    }

    // According to Alipay docs, we must return "success" immediately after successful verification
    // Process business logic asynchronously to avoid timeout
    // If we don't return "success", Alipay will keep retrying for 25 hours (8 times)
    setImmediate(() => {
      void (async () => {
        try {
          const order = await this.ordersService.findByOrderNo(out_trade_no);
          const orderAmountInYuan = (order.amount / 100).toFixed(2);
          if (total_amount !== orderAmountInYuan) {
            return;
          }

          if (
            trade_status === 'TRADE_SUCCESS' ||
            trade_status === 'TRADE_FINISHED'
          ) {
            await this.ordersService.markAsPaid(out_trade_no, trade_no);
          } else if (trade_status === 'TRADE_CLOSED') {
            await this.ordersService.close(out_trade_no);
          }
        } catch (error) {
          console.error(
            `[Alipay Callback] Error processing callback: ${error}`,
          );
        }
      })();
    });

    // According to Alipay docs: must return exactly "success" (7 characters) for successful verification
    return 'success';
  }

  async query(userId: string, orderId: string) {
    const order = await this.ordersService.findById(userId, orderId);
    const response = await this.pay.curl('POST', '/v3/alipay/trade/query', {
      body: {
        out_trade_no: order.orderNo,
        query_options: ['trade_settle_info'],
      },
    });
    const alipayData = response as unknown as AlipayQueryResponse;
    if (
      (alipayData.trade_status === AlipayTradeStatus.TRADE_SUCCESS ||
        alipayData.trade_status === AlipayTradeStatus.TRADE_FINISHED) &&
      order.status !== OrderStatus.PAID
    ) {
      const orderAmountInYuan = (order.amount / 100).toFixed(2);
      if (alipayData.total_amount !== orderAmountInYuan) {
        throw new AppException(
          this.i18n.t('pay.errors.orderAmountMismatch'),
          'ORDER_AMOUNT_MISMATCH',
          HttpStatus.BAD_REQUEST,
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
