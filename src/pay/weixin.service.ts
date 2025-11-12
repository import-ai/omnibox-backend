import WxPay from 'wechatpay-node-v3';
import { Request, Response } from 'express';
import { WECHAT_PAY_MANAGER } from 'nest-wechatpay-node-v3';
import { ConfigService } from '@nestjs/config';
import {
  WeixinQueryResponse,
  WeixinTradeState,
  WeixinCallbackBody,
} from 'omniboxd/pay/types';
import { Inject, Injectable, HttpStatus } from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { OrdersService } from 'omniboxd/orders/orders.service';
import {
  PaymentMethod,
  PaymentType,
  OrderStatus,
} from 'omniboxd/orders/entities/order.entity';
import { I18nService } from 'nestjs-i18n';
import { UserService } from 'omniboxd/user/user.service';

@Injectable()
export class WeixinService {
  constructor(
    @Inject(WECHAT_PAY_MANAGER) private pay: WxPay,
    private configService: ConfigService,
    private ordersService: OrdersService,
    private readonly i18n: I18nService,
    private readonly userService: UserService,
  ) {}

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
      // Get user's wechat binding to retrieve openid
      const binding = await this.userService.findUserBinding(userId, 'wechat');
      if (!binding || !binding.metadata?.openid) {
        throw new AppException(
          this.i18n.t('pay.errors.wechatNotBound'),
          'WECHAT_NOT_BOUND',
          HttpStatus.BAD_REQUEST,
        );
      }
      const response = await this.pay.transactions_jsapi({
        description: order.description,
        out_trade_no: order.orderNo,
        notify_url: notifyUrl,
        amount: {
          total: order.amount, // Currency unit: cent
          currency: 'CNY',
        },
        payer: {
          openid: binding.metadata.openid,
        },
        scene_info: {
          payer_client_ip: ip,
        },
      });
      if (response.status !== 200) {
        throw new AppException(
          response.error,
          'WECHAT_PAY_ERROR',
          HttpStatus.BAD_REQUEST,
        );
      }
      return { ...response.data, orderId: order.id };
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
      if (response.status !== 200) {
        throw new AppException(
          response.error,
          'WECHAT_PAY_ERROR',
          HttpStatus.BAD_REQUEST,
        );
      }
      return { ...response.data, orderId: order.id };
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
      if (response.status !== 200) {
        throw new AppException(
          response.error,
          'WECHAT_PAY_ERROR',
          HttpStatus.BAD_REQUEST,
        );
      }
      return { ...response.data, orderId: order.id };
    }
    throw new AppException(
      this.i18n.t('pay.errors.invalidParameter'),
      'INVALID_PARAMETER',
      HttpStatus.BAD_REQUEST,
    );
  }

  async callback(req: Request, res: Response) {
    const headers = req.headers as any;
    const body = req.body as WeixinCallbackBody;
    const ret = await this.pay.verifySign({
      body,
      signature: headers['wechatpay-signature'],
      serial: headers['wechatpay-serial'],
      nonce: headers['wechatpay-nonce'],
      timestamp: headers['wechatpay-timestamp'],
    });
    if (!ret) {
      return res.status(400).json({
        code: 'FAIL',
        message: 'Signature verification failed',
      });
    }

    const data = this.pay.decipher_gcm(
      body.resource.ciphertext,
      body.resource.associated_data,
      body.resource.nonce,
    );

    const { out_trade_no, transaction_id, trade_state, amount } = data as {
      out_trade_no: string;
      transaction_id: string;
      trade_state: WeixinTradeState;
      amount: { total: number };
    };

    setImmediate(() => {
      void (async () => {
        const order = await this.ordersService.findByOrderNo(out_trade_no);
        if (amount.total !== order.amount) {
          return;
        }
        if (trade_state === WeixinTradeState.SUCCESS) {
          await this.ordersService.markAsPaid(out_trade_no, transaction_id);
        } else if (trade_state === WeixinTradeState.CLOSED) {
          await this.ordersService.close(out_trade_no);
        }
      })();
    });

    return res.status(200);
  }

  async query(userId: string, orderId: string) {
    const order = await this.ordersService.findById(userId, orderId);

    if (order.status === OrderStatus.PAID) {
      return order;
    }

    const response = await this.pay.query({
      out_trade_no: order.orderNo,
    });

    if (response.status !== 200) {
      throw new AppException(
        response.error,
        'WECHAT_PAY_ERROR',
        HttpStatus.BAD_REQUEST,
      );
    }

    const wechatData = response.data as unknown as WeixinQueryResponse;

    if (wechatData.trade_state === WeixinTradeState.SUCCESS) {
      if (wechatData.amount && wechatData.amount.total !== order.amount) {
        throw new AppException(
          this.i18n.t('pay.errors.orderAmountMismatch'),
          'ORDER_AMOUNT_MISMATCH',
          HttpStatus.BAD_REQUEST,
        );
      }

      await this.ordersService.markAsPaid(
        order.orderNo,
        wechatData.transaction_id || '',
      );
    }

    if (
      wechatData.trade_state === WeixinTradeState.CLOSED &&
      order.status !== OrderStatus.CLOSED
    ) {
      await this.ordersService.close(order.orderNo);
    }

    if (wechatData.payer && wechatData.payer.openid) {
      await this.userService.updateUserBindingWhenMetadataEmpty(
        userId,
        'wechat',
        {
          openid: wechatData.payer.openid,
        },
      );
    }

    return await this.ordersService.findById(userId, orderId);
  }
}
