import { Base } from 'omniboxd/common/base.entity';
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

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
  orderNo: string;

  @Column('varchar')
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
  thirdPartyOrderNo: string | null;

  @Column('varchar')
  description: string;

  @Column('timestamptz', { nullable: true })
  paidAt: Date | null;

  @Column('timestamptz', { nullable: true })
  closedAt: Date | null;

  @Column('timestamptz', { nullable: true })
  refundedAt: Date | null;
}
