import fs from 'fs';
import WxPay from 'wechatpay-node-v3';
import { ConfigService } from '@nestjs/config';
import {
  WeixinCallbackBody,
  WeixinQueryResponse,
  WeixinTradeState,
} from 'omniboxd/pay/types';
import { Injectable, BadRequestException } from '@nestjs/common';
import { OrdersService } from 'omniboxd/orders/orders.service';
import {
  PaymentMethod,
  PaymentType,
  OrderStatus,
} from 'omniboxd/orders/entities/order.entity';
import { I18nService } from 'nestjs-i18n';

@Injectable()
export class WeixinService {
  private pay: WxPay;

  constructor(
    private configService: ConfigService,
    private ordersService: OrdersService,
    private readonly i18n: I18nService,
  ) {
    this.pay = new WxPay({
      key: this.configService.get<string>('OBB_WECHAT_APP_KEY', ''),
      appid: this.configService.get<string>('OBB_WECHAT_PAY_APPID', ''),
      mchid: this.configService.get<string>('OBB_WECHAT_PAY_MCHID', ''),
      serial_no: this.configService.get<string>('OBB_WECHAT_PAY_SERIAL', ''),
      publicKey: fs.readFileSync(
        this.configService.get<string>('OBB_WECHAT_PAY_CERT_PATH', ''),
      ),
      privateKey: fs.readFileSync(
        this.configService.get<string>('OBB_WECHAT_PAY_KEY_PATH', ''),
      ),
    });
  }

  async transactions(
    userId: string,
    type: 'native' | 'jsapi' | 'h5',
    productId: string,
    ip: string,
  ) {
    let paymentType: PaymentType;
    if (type === 'jsapi') {
      paymentType = PaymentType.JSAPI;
    } else if (type === 'h5') {
      paymentType = PaymentType.H5;
    } else {
      paymentType = PaymentType.NATIVE;
    }

    const order = await this.ordersService.create(userId, {
      productId,
      paymentMethod: PaymentMethod.WECHAT,
      paymentType,
    });

    const baseURL = this.configService.get<string>(
      'OBB_BASE_URL',
      'https://www.omnibox.pro',
    );
    const notifyUrl = `${baseURL}/api/v1/pay/weixin/callback`;

    if (type === 'jsapi') {
      const response = await this.pay.transactions_jsapi({
        description: order.description,
        out_trade_no: order.orderNo,
        notify_url: notifyUrl,
        amount: {
          total: order.amount, // Currency unit: cent
          currency: 'CNY',
        },
        payer: {
          openid: 'TODO', // TODO: 需要从用户绑定中获取 openid
        },
        scene_info: {
          payer_client_ip: ip,
        },
      });
      return { ...response, orderId: order.id, orderNo: order.orderNo };
    }
    if (type === 'h5') {
      const response = await this.pay.transactions_h5({
        description: order.description,
        out_trade_no: order.orderNo,
        notify_url: notifyUrl,
        amount: {
          total: order.amount,
          currency: 'CNY',
        },
        scene_info: {
          payer_client_ip: ip,
          h5_info: {
            type: 'Wap',
            app_name: 'Omnibox',
            app_url: 'https://www.omnibox.pro',
          },
        },
      });
      return { ...response, orderId: order.id, orderNo: order.orderNo };
    }
    if (type === 'native') {
      const response = await this.pay.transactions_native({
        description: order.description,
        out_trade_no: order.orderNo,
        notify_url: notifyUrl,
        amount: {
          total: order.amount,
          currency: 'CNY',
        },
        scene_info: {
          payer_client_ip: ip,
        },
      });
      return { ...response, orderId: order.id, orderNo: order.orderNo };
    }
    throw new BadRequestException(this.i18n.t('pay.errors.invalidParameter'));
  }

  async callback(body: WeixinCallbackBody) {
    const data = this.pay.decipher_gcm(
      body.resource.ciphertext,
      body.resource.associated_data,
      body.resource.nonce,
    );

    const { out_trade_no, transaction_id, trade_state, amount } = data as {
      out_trade_no: string;
      transaction_id: string;
      trade_state: string;
      amount: { total: number };
    };

    const order = await this.ordersService.findByOrderNo(out_trade_no);

    if (amount.total !== order.amount) {
      throw new BadRequestException(
        this.i18n.t('pay.errors.orderAmountMismatch'),
      );
    }

    if (trade_state === 'SUCCESS') {
      await this.ordersService.markAsPaid(out_trade_no, transaction_id);
    } else if (trade_state === 'CLOSED') {
      await this.ordersService.close(out_trade_no);
    }

    return { code: 'SUCCESS', message: '成功' };
  }

  async query(userId: string, orderId: string) {
    const order = await this.ordersService.findById(userId, orderId);
    const response = await this.pay.query({
      out_trade_no: order.orderNo,
    });

    const wechatData = response as unknown as WeixinQueryResponse;

    if (
      wechatData.trade_state === WeixinTradeState.SUCCESS &&
      order.status !== OrderStatus.PAID
    ) {
      if (wechatData.amount && wechatData.amount.total !== order.amount) {
        throw new BadRequestException(
          this.i18n.t('pay.errors.orderAmountMismatch'),
        );
      }

      await this.ordersService.markAsPaid(
        order.orderNo,
        wechatData.transaction_id || '',
      );
    }

    if (
      wechatData.trade_state === WeixinTradeState.CLOSED &&
      order.status !== OrderStatus.CLOSED &&
      order.status !== OrderStatus.PAID
    ) {
      await this.ordersService.close(order.orderNo);
    }

    return await this.ordersService.findById(userId, orderId);
  }
}
