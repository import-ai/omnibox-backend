import { Base } from 'omniboxd/common/base.entity';
import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

export enum OrderStatus {
  PENDING = 'pending',
  PAID = 'paid',
  CLOSED = 'closed',
  REFUNDED = 'refunded',
}

export enum PaymentMethod {
  ALIPAY = 'alipay',
  WECHAT = 'wechat',
}

export enum PaymentType {
  NATIVE = 'native',
  H5 = 'h5',
  JSAPI = 'jsapi',
}

@Entity('orders')
export class Order extends Base {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { unique: true })
  @Index()
  orderNo: string;

  @Column('varchar')
  @Index()
  userId: string;

  @Column('varchar', { nullable: true })
  productId: string | null;

  @Column('int')
  amount: number;

  @Column('varchar', { default: 'CNY' })
  currency: string;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.PENDING,
  })
  @Index()
  status: OrderStatus;

  @Column({
    type: 'enum',
    enum: PaymentMethod,
    nullable: true,
  })
  paymentMethod: PaymentMethod | null;

  @Column({
    type: 'enum',
    enum: PaymentType,
    nullable: true,
  })
  paymentType: PaymentType | null;

  @Column('varchar', { nullable: true })
  @Index()
  thirdPartyOrderNo: string | null; // 第三方支付平台订单号（微信/支付宝）

  @Column('varchar')
  description: string;

  @Column('jsonb', { nullable: true })
  metadata: Record<string, any> | null; // 其他元数据

  @Column('timestamptz', { nullable: true })
  paidAt: Date | null;

  @Column('timestamptz', { nullable: true })
  closedAt: Date | null;

  @Column('timestamptz', { nullable: true })
  refundedAt: Date | null;
}
