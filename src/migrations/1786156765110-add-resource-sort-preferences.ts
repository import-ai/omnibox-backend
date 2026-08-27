import { MigrationInterface, QueryRunner, Table } from 'typeorm';

import { BaseColumns } from './base-columns';

export class AddResourceSortPreferences1786156765110 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'resource_sort_preferences',
        columns: [
          {
            name: 'id',
            type: 'bigserial',
            isPrimary: true,
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
            name: 'space_type',
            type: 'character varying',
            isNullable: false,
          },
          {
            name: 'sort_by',
            type: 'character varying',
            isNullable: false,
          },
          {
            name: 'sort_order',
            type: 'character varying',
            isNullable: false,
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
            name: 'UQ_resource_sort_preferences_user_namespace_space',
            columnNames: ['user_id', 'namespace_id', 'space_type'],
            isUnique: true,
            where: '"deleted_at" IS NULL',
          },
        ],
      }),
      true,
      true,
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('resource_sort_preferences', true, true, true);
  }
}
