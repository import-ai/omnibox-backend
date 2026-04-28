import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableIndex,
} from 'typeorm';
import { BaseColumns } from './base-columns';

export class AddSmartFolders1776852000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE resource_type ADD VALUE IF NOT EXISTS 'smart_folder';
    `);

    const existingTable = await queryRunner.getTable('smart_folder_configs');
    if (existingTable) {
      await this.ensureOwnerScope(queryRunner, existingTable);
      return;
    }

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
          name: 'owner_scope',
          type: 'character varying',
          isNullable: false,
          default: "'private'",
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
          name: 'idx_smart_folder_configs_owner_scope',
          columnNames: ['namespace_id', 'owner_user_id', 'owner_scope'],
        },
      ],
    });

    await queryRunner.createTable(table, true, true, true);
  }

  private async ensureOwnerScope(
    queryRunner: QueryRunner,
    table: Table,
  ): Promise<void> {
    if (!table.findColumnByName('owner_scope')) {
      await queryRunner.addColumn(
        'smart_folder_configs',
        new TableColumn({
          name: 'owner_scope',
          type: 'character varying',
          isNullable: false,
          default: "'private'",
        }),
      );

      await queryRunner.query(`
        UPDATE smart_folder_configs
        SET owner_scope = root_scope
        WHERE root_scope IN ('private', 'teamspace');
      `);
    }

    const oldIndex = table.indices.find(
      (index) => index.name === 'idx_smart_folder_configs_owner_root',
    );
    if (oldIndex) {
      await queryRunner.dropIndex('smart_folder_configs', oldIndex);
    }

    const refreshedTable = await queryRunner.getTable('smart_folder_configs');
    const hasOwnerScopeIndex = refreshedTable?.indices.some(
      (index) => index.name === 'idx_smart_folder_configs_owner_scope',
    );
    if (!hasOwnerScopeIndex) {
      await queryRunner.createIndex(
        'smart_folder_configs',
        new TableIndex({
          name: 'idx_smart_folder_configs_owner_scope',
          columnNames: ['namespace_id', 'owner_user_id', 'owner_scope'],
        }),
      );
    }
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
