import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableCheck,
  TableForeignKey,
  TableIndex,
  TableUnique,
} from 'typeorm';
import { BaseColumns } from './base-columns';

export class AddToolbarPreferences1779625978606 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE toolbar_sort_by AS ENUM (
        'updated_at',
        'created_at',
        'name',
        'manual'
      );
    `);
    await queryRunner.query(`
      CREATE TYPE toolbar_sort_order AS ENUM (
        'asc',
        'desc'
      );
    `);

    const table = new Table({
      name: 'toolbar_preferences',
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
          name: 'sort_by',
          type: 'toolbar_sort_by',
          isNullable: false,
          default: "'updated_at'::toolbar_sort_by",
        },
        {
          name: 'sort_order',
          type: 'toolbar_sort_order',
          isNullable: false,
          default: "'desc'::toolbar_sort_order",
        },
        ...BaseColumns(),
      ],
      uniques: [
        new TableUnique({
          name: 'uq_toolbar_preferences_namespace_user',
          columnNames: ['namespace_id', 'user_id'],
        }),
      ],
      indices: [
        new TableIndex({
          name: 'idx_toolbar_preferences_namespace_user',
          columnNames: ['namespace_id', 'user_id'],
        }),
      ],
      foreignKeys: [
        new TableForeignKey({
          columnNames: ['namespace_id'],
          referencedTableName: 'namespaces',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
        new TableForeignKey({
          columnNames: ['user_id'],
          referencedTableName: 'users',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      ],
      checks: [
        new TableCheck({
          name: 'chk_toolbar_preferences_namespace_user_required',
          expression: '"namespace_id" IS NOT NULL AND "user_id" IS NOT NULL',
        }),
      ],
    });

    await queryRunner.createTable(table, true, true, true);
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
