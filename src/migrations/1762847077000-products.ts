import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { BaseColumns } from './base-columns';

async function createProductsTable(queryRunner: QueryRunner): Promise<void> {
  const table = new Table({
    name: 'products',
    columns: [
      {
        name: 'id',
        type: 'uuid',
        isPrimary: true,
        default: 'uuid_generate_v4()',
      },
      {
        name: 'name',
        type: 'character varying',
        isNullable: false,
      },
      {
        name: 'description',
        type: 'character varying',
        isNullable: false,
      },
      {
        name: 'price',
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
        enum: ['active', 'inactive'],
        isNullable: false,
        default: "'active'",
      },
      {
        name: 'type',
        type: 'enum',
        enum: ['subscription', 'one_time'],
        isNullable: false,
        default: "'one_time'",
      },
      {
        name: 'sort',
        type: 'integer',
        isNullable: false,
        default: 0,
      },
      ...BaseColumns(),
    ],
  });
  await queryRunner.createTable(table, true, true, true);
}

export class Products1762847077000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await createProductsTable(queryRunner);
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
