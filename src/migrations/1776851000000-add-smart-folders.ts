import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { BaseColumns } from './base-columns';

export class AddSmartFolders1776851000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE resource_type ADD VALUE IF NOT EXISTS 'smart_folder';
    `);

    const table = new Table({
      name: 'smart_folder_configs',
      columns: [
        {
          name: 'resource_id',
          type: 'character varying',
          isPrimary: true,
        },
        {
          name: 'namespace_id',
          type: 'character varying',
          isNullable: false,
        },
        {
          name: 'owner_user_id',
          type: 'uuid',
          isNullable: true,
        },
        {
          name: 'root_scope',
          type: 'character varying',
          isNullable: false,
        },
        {
          name: 'match_mode',
          type: 'character varying',
          isNullable: false,
          default: "'all'",
        },
        {
          name: 'conditions',
          type: 'jsonb',
          isNullable: false,
          default: "'[]'::jsonb",
        },
        ...BaseColumns(),
      ],
      foreignKeys: [
        {
          columnNames: ['resource_id'],
          referencedTableName: 'resources',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        },
        {
          columnNames: ['namespace_id'],
          referencedTableName: 'namespaces',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        },
        {
          columnNames: ['owner_user_id'],
          referencedTableName: 'users',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        },
      ],
      indices: [
        {
          name: 'idx_smart_folder_configs_namespace_root',
          columnNames: ['namespace_id', 'root_scope'],
        },
        {
          name: 'idx_smart_folder_configs_owner_root',
          columnNames: ['namespace_id', 'owner_user_id', 'root_scope'],
        },
      ],
    });

    await queryRunner.createTable(table, true, true, true);
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
