import { Base } from 'omniboxd/common/base.entity';
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

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

  @Column('varchar')
  name: string;

  @Column('varchar') // No more than 127 characters
  description: string;

  @Column('int') // Currency unit: cent
  price: number;

  @Column('varchar', { default: 'CNY' })
  currency: string;

  @Column({
    type: 'enum',
    enum: ProductStatus,
    default: ProductStatus.ACTIVE,
  })
  status: ProductStatus;

  @Column({
    type: 'enum',
    enum: ProductType,
    default: ProductType.ONE_TIME,
  })
  type: ProductType;

  @Column('int', { default: 0 })
  sort: number;
}
