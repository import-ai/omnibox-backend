import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { BaseColumns } from './base-columns';

async function createStorageUsagesTable(
  queryRunner: QueryRunner,
): Promise<void> {
  const table = new Table({
    name: 'storage_usages',
    columns: [
      {
        name: 'id',
        type: 'bigserial',
        isPrimary: true,
      },
      {
        name: 'namespace_id',
        type: 'character varying',
        isNullable: false,
      },
      {
        name: 'user_id',
        type: 'uuid',
        isNullable: false,
      },
      {
        name: 'storage_type',
        type: 'character varying',
        isNullable: false,
      },
      {
        name: 'amount',
        type: 'bigint',
        isNullable: false,
        default: 0,
      },
      ...BaseColumns(),
    ],
    foreignKeys: [
      {
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
      },
      {
        columnNames: ['namespace_id'],
        referencedTableName: 'namespaces',
        referencedColumnNames: ['id'],
      },
    ],
    indices: [
      {
        name: 'UQ_storage_usages_namespace_user_type',
        columnNames: ['namespace_id', 'user_id', 'storage_type'],
        isUnique: true,
        where: '"deleted_at" IS NULL',
      },
    ],
  });
  await queryRunner.createTable(table, true, true, true);
}

export class StorageUsages1768556182000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await createStorageUsagesTable(queryRunner);
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
