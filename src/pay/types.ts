export interface WeixinCallbackBody {
  id: string;
  create_time: string;
  resource_type: string;
  event_type: string;
  summary: string;
  resource: {
    original_type: string;
    algorithm: string;
    ciphertext: string;
    associated_data: string;
    nonce: string;
  };
}

export interface AlipayCallbackQuery {
  notify_type: string;
  notify_id: string;
  notify_time: string;
  sign_type: string;
  sign: string;

  merchant_app_id?: string;
  buyer_open_id?: string;
  buyer_id?: string;
  buyer_logon_id?: string;
  seller_id?: string;
  seller_email?: string;
  app_id?: string;

  total_amount?: string;
  refund_fee?: string;
  receipt_amount?: string;
  invoice_amount?: string;
  buyer_pay_amount?: string;
  point_amount?: string;
  charge_amount?: string;
  current_seller_received_amount?: string;
  seller_received_total_amount?: string;
  total_from_seller_fee?: string;
  mdiscount_amount?: string;
  discount_amount?: string;
  hyb_amount?: string;

  subject?: string;
  body?: string;
  out_trade_no?: string;
  trade_no?: string;
  trade_status?: string;
  out_biz_no?: string;

  gmt_create?: string;
  gmt_payment?: string;
  gmt_refund?: string;
  gmt_close?: string;

  fund_bill_list?: string;
  voucher_detail_list?: string;
  discount_goods_detail?: string;
  hb_fq_pay_info?: string;
  charge_info_list?: string;

  passback_params?: string;
  out_channel_type?: string;
  charge_flags?: string;
  settlement_id?: string;
  notify_action_type?: string;
  ff_current_period?: string;
  receipt_currency_type?: string;
  enterprise_pay_info?: string;
  cashier_type?: string;
}

export enum WeixinTradeState {
  SUCCESS = 'SUCCESS',
  REFUND = 'REFUND',
  NOTPAY = 'NOTPAY',
  CLOSED = 'CLOSED',
  REVOKED = 'REVOKED',
  USERPAYING = 'USERPAYING',
  PAYERROR = 'PAYERROR',
}

// https://pay.weixin.qq.com/doc/v3/merchant/4012791859
export interface WeixinQueryResponse {
  appid: string;

  mchid: string;

  out_trade_no: string;

  transaction_id?: string;

  trade_type?: string;

  trade_state: WeixinTradeState;

  trade_state_desc: string;

  bank_type?: string;

  attach?: string;

  success_time?: string;

  payer?: {
    openid: string;
  };

  amount?: {
    total: number;

    payer_total?: number;

    currency?: string;

    payer_currency?: string;
  };

  scene_info?: {
    device_id?: string;
  };

  promotion_detail?: Array<{
    coupon_id: string;

    name?: string;

    scope?: string;

    type?: string;

    amount: number;

    stock_id?: string;

    wechatpay_contribute?: number;

    merchant_contribute?: number;

    other_contribute?: number;

    currency?: string;

    goods_detail?: Array<{
      goods_id: string;

      quantity: number;

      unit_price: number;

      discount_amount: number;

      goods_remark?: string;
    }>;
  }>;
}

export enum AlipayTradeStatus {
  WAIT_BUYER_PAY = 'WAIT_BUYER_PAY',
  TRADE_CLOSED = 'TRADE_CLOSED',
  TRADE_SUCCESS = 'TRADE_SUCCESS',
  TRADE_FINISHED = 'TRADE_FINISHED',
}

// https://opendocs.alipay.com/open/bff76748_alipay.trade.query
export interface AlipayQueryResponse {
  code: string;

  msg: string;

  out_trade_no: string;

  trade_no: string;

  trade_status: AlipayTradeStatus;

  total_amount: string;

  receipt_amount?: string;

  buyer_pay_amount?: string;

  point_amount?: string;

  invoice_amount?: string;

  buyer_user_id?: string;

  buyer_logon_id?: string;

  seller_id?: string;

  send_pay_date?: string;

  subject?: string;

  body?: string;

  store_name?: string;

  store_id?: string;

  terminal_id?: string;

  alipay_store_id?: string;

  fund_bill_list?: Array<{
    fund_channel: string;

    amount: string;

    real_amount?: string;
  }>;

  voucher_detail_list?: Array<{
    id: string;

    name: string;

    type: string;

    amount: string;

    merchant_contribute?: string;

    other_contribute?: string;

    memo?: string;

    template_id?: string;

    purchase_buyer_contribute?: string;

    purchase_merchant_contribute?: string;

    purchase_ant_contribute?: string;
  }>;

  discount_goods_detail?: string;

  business_params?: string;

  industry_sepc_detail?: string;
}
