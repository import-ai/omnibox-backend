import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { BaseColumns } from './base-columns';

async function createAppAuthorizationsTable(
  queryRunner: QueryRunner,
): Promise<void> {
  const table = new Table({
    name: 'app_authorizations',
    columns: [
      {
        name: 'id',
        type: 'uuid',
        isPrimary: true,
        default: 'uuid_generate_v4()',
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
        name: 'app_id',
        type: 'character varying',
        isNullable: false,
      },
      {
        name: 'api_key_id',
        type: 'uuid',
        isNullable: true,
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
      {
        columnNames: ['api_key_id'],
        referencedTableName: 'api_keys',
        referencedColumnNames: ['id'],
      },
    ],
    indices: [
      {
        name: 'UQ_app_authorizations_user_namespace_app',
        columnNames: ['user_id', 'namespace_id', 'app_id'],
        isUnique: true,
      },
    ],
  });
  await queryRunner.createTable(table, true, true, true);
}

export class AppAuthorizations1756914379375 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await createAppAuthorizationsTable(queryRunner);
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
