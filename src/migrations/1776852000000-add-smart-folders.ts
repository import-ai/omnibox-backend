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
    await this.addSmartFolderResourceType(queryRunner);
    await this.ensureSmartFolderEnums(queryRunner);

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
          type: 'enum',
          enumName: 'smart_folder_owner_scope',
          enum: ['private', 'teamspace'],
          isNullable: false,
          default: "'private'",
        },
        {
          name: 'root_scope',
          type: 'enum',
          enumName: 'smart_folder_root_scope',
          enum: ['private', 'teamspace', 'all'],
          isNullable: false,
        },
        {
          name: 'match_mode',
          type: 'enum',
          enumName: 'smart_folder_match_mode',
          enum: ['all', 'any'],
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

  private async ensureSmartFolderEnums(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE smart_folder_owner_scope AS ENUM ('private', 'teamspace');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE smart_folder_root_scope AS ENUM ('private', 'teamspace', 'all');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE smart_folder_match_mode AS ENUM ('all', 'any');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
  }

  private async addSmartFolderResourceType(
    queryRunner: QueryRunner,
  ): Promise<void> {
    const enumExists = await queryRunner.query(`
      SELECT 1 FROM pg_enum
      WHERE enumlabel = 'smart_folder'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'resource_type')
    `);

    if (enumExists.length > 0) {
      return;
    }

    await queryRunner.commitTransaction();
    await queryRunner.query(`
      ALTER TYPE resource_type ADD VALUE 'smart_folder'
    `);
    await queryRunner.startTransaction();
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
          type: 'enum',
          enumName: 'smart_folder_owner_scope',
          enum: ['private', 'teamspace'],
          isNullable: false,
          default: "'private'",
        }),
      );

      await queryRunner.query(`
        UPDATE smart_folder_configs
        SET owner_scope = root_scope::text::smart_folder_owner_scope
        WHERE root_scope IN ('private', 'teamspace');
      `);
    }

    const refreshedScopeTable = await queryRunner.getTable(
      'smart_folder_configs',
    );
    if (refreshedScopeTable) {
      await this.ensureSmartFolderConfigEnumColumns(
        queryRunner,
        refreshedScopeTable,
      );
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

  private async ensureSmartFolderConfigEnumColumns(
    queryRunner: QueryRunner,
    table: Table,
  ): Promise<void> {
    if (table.findColumnByName('owner_scope')?.type !== 'enum') {
      await queryRunner.query(`
        ALTER TABLE smart_folder_configs
        ALTER COLUMN owner_scope DROP DEFAULT,
        ALTER COLUMN owner_scope TYPE smart_folder_owner_scope
          USING owner_scope::text::smart_folder_owner_scope,
        ALTER COLUMN owner_scope SET DEFAULT 'private';
      `);
    }
    if (table.findColumnByName('root_scope')?.type !== 'enum') {
      await queryRunner.query(`
        ALTER TABLE smart_folder_configs
        ALTER COLUMN root_scope TYPE smart_folder_root_scope
          USING root_scope::text::smart_folder_root_scope;
      `);
    }
    if (table.findColumnByName('match_mode')?.type !== 'enum') {
      await queryRunner.query(`
        ALTER TABLE smart_folder_configs
        ALTER COLUMN match_mode DROP DEFAULT,
        ALTER COLUMN match_mode TYPE smart_folder_match_mode
          USING match_mode::text::smart_folder_match_mode,
        ALTER COLUMN match_mode SET DEFAULT 'all';
      `);
    }
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
