import fs from 'fs';
import WxPay from 'wechatpay-node-v3';
import { ConfigService } from '@nestjs/config';
import { WeixinCallbackBody } from 'omniboxd/pay/types';
import { Injectable, BadRequestException } from '@nestjs/common';
import { OrdersService } from 'omniboxd/orders/orders.service';
import {
  PaymentMethod,
  PaymentType,
} from 'omniboxd/orders/entities/order.entity';

@Injectable()
export class WeixinService {
  private pay: WxPay;

  constructor(
    private readonly configService: ConfigService,
    private readonly ordersService: OrdersService,
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
  ) {
    // 确定支付类型
    let paymentType: PaymentType;
    if (type === 'jsapi') {
      paymentType = PaymentType.JSAPI;
    } else if (type === 'h5') {
      paymentType = PaymentType.H5;
    } else {
      paymentType = PaymentType.NATIVE;
    }

    // 创建订单
    const order = await this.ordersService.create(userId, {
      productId,
      amount: 1, // TODO: 根据 productId 获取实际金额
      description: '产品购买', // TODO: 根据 productId 获取产品描述
      paymentMethod: PaymentMethod.WECHAT,
      paymentType,
    });

    const notifyUrl = this.configService.get<string>(
      'OBB_WECHAT_NOTIFY_URL',
      '',
    );

    if (type === 'jsapi') {
      // TODO: 需要从请求中获取用户的 openid
      const response = await this.pay.transactions_jsapi({
        description: order.description,
        out_trade_no: order.orderNo,
        notify_url: notifyUrl,
        amount: {
          total: order.amount, // 单位分
          currency: 'CNY',
        },
        payer: {
          openid: 'TODO', // TODO: 需要从用户绑定中获取 openid
        },
        scene_info: {
          payer_client_ip: '127.0.0.1', // TODO: 从请求中获取真实IP
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
          payer_client_ip: '127.0.0.1', // TODO: 从请求中获取真实IP
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
          payer_client_ip: '127.0.0.1', // TODO: 从请求中获取真实IP
        },
      });
      return { ...response, orderId: order.id, orderNo: order.orderNo };
    }
    throw new BadRequestException('参数错误');
  }

  async callback(body: WeixinCallbackBody) {
    // 解密回调数据
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

    // 获取订单
    const order = await this.ordersService.findByOrderNo(out_trade_no);

    // 验证金额
    if (amount.total !== order.amount) {
      throw new BadRequestException('订单金额不匹配');
    }

    // 根据支付状态更新订单
    if (trade_state === 'SUCCESS') {
      await this.ordersService.markAsPaid(out_trade_no, transaction_id);
    } else if (trade_state === 'CLOSED') {
      await this.ordersService.close(out_trade_no);
    }

    return { code: 'SUCCESS', message: '成功' };
  }

  async query(userId: string, orderId: string) {
    // 查询本地订单
    const order = await this.ordersService.findById(userId, orderId);

    // 查询微信支付订单状态
    const wechatData = await this.pay.query({ out_trade_no: order.orderNo });

    return {
      order,
      wechatData,
    };
  }
}
