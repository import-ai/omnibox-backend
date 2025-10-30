import WxPay from 'wechatpay-node-v3';
import { WeixinCallbackBody } from 'omniboxd/pay/types';
import { WECHAT_PAY_MANAGER } from 'nest-wechatpay-node-v3';
import { Inject, Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class PayService {
  constructor(@Inject(WECHAT_PAY_MANAGER) private wxPay: WxPay) {}

  async weixinTransactions(
    userId: string,
    type: 'native' | 'jsapi' | 'h5',
    productId: string,
  ) {
    // 此处根据 userId和 productID 生成订单和用户数据
    console.log(userId, type, productId);
    if (type === 'jsapi') {
      // 返回值可以直接用于前端调起 WeixinJSBridge 函数
      const response = await this.wxPay.transactions_jsapi({
        description: '测试',
        out_trade_no: '订单号',
        attach: '128个字符（可以用来携带用户数据）',
        notify_url: '回调url 255',
        amount: {
          total: 1, // 单位分
          currency: 'CNY',
        },
        payer: {
          openid: 'drEc8QfY', //openid
        },
        scene_info: {
          payer_client_ip: 'ip',
        },
      });
      return response;
    }
    if (type === 'h5') {
      const response = await this.wxPay.transactions_h5({
        description: '测试',
        out_trade_no: '订单号',
        attach: '',
        notify_url: '回调url',
        amount: {
          total: 1,
          currency: 'CNY',
        },
        scene_info: {
          payer_client_ip: 'ip',
          h5_info: {
            type: 'Wap',
            app_name: 'Omnibox',
            app_url: 'https://www.omnibox.pro',
          },
        },
      });
      return response;
      //  返回
      //  {
      //  status: 200,
      //  h5_url: 'https://wx.tenpay.com/cgi-bin/mmpayweb-bin/checkmweb?prepay_id=wx051840206120147833cf4bcfcef12b0000&package=2056162962'
      //  }
    }
    if (type === 'native') {
      // native
      const response = await this.wxPay.transactions_native({
        description: '测试',
        out_trade_no: '订单号',
        attach: '',
        notify_url: '回调url',
        amount: {
          total: 1,
          currency: 'CNY',
        },
        scene_info: {
          payer_client_ip: 'ip',
        },
      });
      return { ...response, orderId: 'xxx' };
      // { status: 200, code_url: 'weixin://wxpay/bizpayurl?pr=9xFPmlUzz' }
    }
    throw new BadRequestException('参数错误');
  }

  weixinCallback(response: WeixinCallbackBody) {
    const data = this.wxPay.decipher_gcm(
      response.resource.ciphertext,
      response.resource.associated_data,
      response.resource.nonce,
    );
    /***
    {
      mchid: '商户号',
      appid: 'appid',
      out_trade_no: '1610419296553',
      transaction_id: '4200000848202101120290526543',
      trade_type: 'NATIVE',
      trade_state: 'SUCCESS',
      trade_state_desc: '支付成功',
      bank_type: 'OTHERS',
      attach: '',
      success_time: '2021-01-12T10:43:43+08:00',
      payer: { openid: '' },
      amount: { total: 1, payer_total: 1, currency: 'CNY', payer_currency: 'CNY' }
    }

    trade_type
JSAPI：公众号支付、小程序支付

NATIVE：Native支付

APP：APP支付

MICROPAY：付款码支付

MWEB：H5支付

FACEPAY：刷脸支付

trade_state

SUCCESS：支付成功

REFUND：转入退款

NOTPAY：未支付

CLOSED：已关闭

REVOKED：已撤销（仅付款码支付会返回）

USERPAYING：用户支付中（仅付款码支付会返回）

PAYERROR：支付失败（仅付款码支付会返回）

    */
  }

  async weixinQuery(userId: string, orderId: string) {
    // 此处根据 userId和 orderId 查询订单和用户数据
    return await this.wxPay.query({ out_trade_no: orderId });
    // {
    //   status: 200,
    //   appid: 'appid',
    //   attach: '',
    //   mchid: '商户号',
    //   out_trade_no: '1609899981750',
    //   payer: {},
    //   promotion_detail: [],
    //   trade_state: 'CLOSED',
    //   trade_state_desc: '订单已关闭'
    // }
  }

  // async alipayTransactions(
  //   userId: string,
  //   type: 'native' | 'jsapi' | 'h5',
  //   productId: string,
  // ) {
  //   //
  // }

  // async alipayCallback() {
  //   //
  // }

  // async alipayQuery() {
  //   //
  // }
}
