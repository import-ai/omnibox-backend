import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { BaseColumns } from './base-columns';

async function createApiKeysTable(queryRunner: QueryRunner): Promise<void> {
  const table = new Table({
    name: 'api_keys',
    columns: [
      {
        name: 'id',
        type: 'uuid',
        isPrimary: true,
        default: 'uuid_generate_v4()',
      },
      {
        name: 'user_id',
        type: 'uuid',
        isNullable: false,
      },
      {
        name: 'namespace_id',
        type: 'character varying',
        isNullable: false,
      },
      {
        name: 'value',
        type: 'character varying',
        isNullable: false,
        isUnique: true,
      },
      {
        name: 'attrs',
        type: 'jsonb',
        isNullable: false,
        default: "'{}'::jsonb",
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
  });
  await queryRunner.createTable(table, true, true, true);
}

export class ApiKeys1754550165406 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await createApiKeysTable(queryRunner);
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
