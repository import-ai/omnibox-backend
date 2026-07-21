import { MigrationInterface, QueryRunner, Table } from 'typeorm';

import { BaseColumns } from './base-columns';

async function createFeaturePreviewsTable(
  queryRunner: QueryRunner,
): Promise<void> {
  const table = new Table({
    name: 'feature_previews',
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
        name: 'feature',
        type: 'character varying',
        isNullable: false,
      },
      {
        name: 'enabled',
        type: 'boolean',
        isNullable: false,
        default: false,
      },
      ...BaseColumns(),
    ],
    foreignKeys: [
      {
        columnNames: ['namespace_id'],
        referencedTableName: 'namespaces',
        referencedColumnNames: ['id'],
      },
      {
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
      },
    ],
    indices: [
      {
        name: 'UQ_feature_previews_namespace_user_feature',
        columnNames: ['namespace_id', 'user_id', 'feature'],
        isUnique: true,
        where: '"deleted_at" IS NULL',
      },
    ],
  });
  await queryRunner.createTable(table, true, true, true);
}

export class FeaturePreviews1784521510168 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await createFeaturePreviewsTable(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('feature_previews', true, true, true);
  }
}
