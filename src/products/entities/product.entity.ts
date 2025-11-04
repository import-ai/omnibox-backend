import { Base } from 'omniboxd/common/base.entity';
import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

export enum ProductStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export enum ProductType {
  SUBSCRIPTION = 'subscription',
  ONE_TIME = 'one_time',
}

@Entity('products')
export class Product extends Base {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { unique: true })
  @Index()
  code: string;

  @Column('varchar')
  name: string;

  @Column('text')
  description: string;

  @Column('int')
  price: number;

  @Column('varchar', { default: 'CNY' })
  currency: string;

  @Column({
    type: 'enum',
    enum: ProductStatus,
    default: ProductStatus.ACTIVE,
  })
  @Index()
  status: ProductStatus;

  @Column({
    type: 'enum',
    enum: ProductType,
    default: ProductType.ONE_TIME,
  })
  type: ProductType;

  @Column('int', { nullable: true })
  stock: number | null; // 库存，null 表示无限库存

  @Column('jsonb', { nullable: true })
  metadata: Record<string, any> | null; // 其他元数据

  @Column('int', { default: 0 })
  sortOrder: number; // 排序顺序
}
