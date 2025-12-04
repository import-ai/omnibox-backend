import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { BaseColumns } from 'omniboxd/migrations/base-columns';

async function createOrdersTable(queryRunner: QueryRunner): Promise<void> {
  const table = new Table({
    name: 'orders',
    columns: [
      {
        name: 'id',
        type: 'uuid',
        isPrimary: true,
        default: 'uuid_generate_v4()',
      },
      {
        name: 'order_no',
        type: 'character varying',
        isNullable: false,
        isUnique: true,
      },
      {
        name: 'user_id',
        type: 'character varying',
        isNullable: false,
      },
      {
        name: 'product_id',
        type: 'uuid',
        isNullable: true,
      },
      {
        name: 'amount',
        type: 'integer',
        isNullable: false,
      },
      {
        name: 'currency',
        type: 'character varying',
        isNullable: false,
        default: "'CNY'",
      },
      {
        name: 'status',
        type: 'enum',
        enum: ['pending', 'paid', 'closed', 'refunded'],
        isNullable: false,
        default: "'pending'",
      },
      {
        name: 'payment_method',
        type: 'enum',
        enum: ['alipay', 'wechat'],
        isNullable: true,
      },
      {
        name: 'payment_type',
        type: 'enum',
        enum: ['native', 'h5', 'jsapi'],
        isNullable: true,
      },
      {
        name: 'third_party_order_no',
        type: 'character varying',
        isNullable: true,
      },
      {
        name: 'description',
        type: 'character varying',
        isNullable: false,
      },
      {
        name: 'paid_at',
        type: 'timestamp with time zone',
        isNullable: true,
      },
      {
        name: 'closed_at',
        type: 'timestamp with time zone',
        isNullable: true,
      },
      {
        name: 'refunded_at',
        type: 'timestamp with time zone',
        isNullable: true,
      },
      ...BaseColumns(),
    ],
    indices: [
      {
        name: 'idx_orders_user_id',
        columnNames: ['user_id'],
      },
      {
        name: 'idx_orders_product_id',
        columnNames: ['product_id'],
      },
      {
        name: 'idx_orders_status',
        columnNames: ['status'],
      },
      {
        name: 'idx_orders_order_no',
        columnNames: ['order_no'],
      },
    ],
  });
  await queryRunner.createTable(table, true, true, true);
}

export class Orders1762847078000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await createOrdersTable(queryRunner);
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
