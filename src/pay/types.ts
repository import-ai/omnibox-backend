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
  // 通知基础信息
  notify_type: string;
  notify_id: string;
  notify_time: string;
  sign_type: string;
  sign: string;

  // 商户和买家信息
  merchant_app_id?: string;
  buyer_open_id?: string;
  buyer_id?: string;
  buyer_logon_id?: string;
  seller_id?: string;
  seller_email?: string;
  app_id?: string;

  // 金额相关
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

  // 交易信息
  subject?: string;
  body?: string;
  out_trade_no?: string;
  trade_no?: string;
  trade_status?: string;
  out_biz_no?: string;

  // 时间相关
  gmt_create?: string;
  gmt_payment?: string;
  gmt_refund?: string;
  gmt_close?: string;

  // 资金和优惠信息
  fund_bill_list?: string;
  voucher_detail_list?: string;
  discount_goods_detail?: string;
  hb_fq_pay_info?: string;
  charge_info_list?: string;

  // 其他信息
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
