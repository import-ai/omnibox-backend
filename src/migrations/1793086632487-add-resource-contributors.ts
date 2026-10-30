import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

import { BaseColumns } from './base-columns';

export class AddResourceContributors1793086632487 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'resource_collaborators',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          { name: 'namespace_id', type: 'character varying' },
          { name: 'resource_id', type: 'character varying' },
          { name: 'user_id', type: 'uuid' },
          { name: 'first_collaborated_at', type: 'timestamptz' },
          ...BaseColumns(),
        ],
      }),
      true,
      true,
      true,
    );
    await queryRunner.createForeignKeys('resource_collaborators', [
      new TableForeignKey({
        columnNames: ['namespace_id'],
        referencedTableName: 'namespaces',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        columnNames: ['resource_id'],
        referencedTableName: 'resources',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
      }),
    ]);
    await queryRunner.createIndex(
      'resource_collaborators',
      new TableIndex({
        name: 'uq_resource_collaborators_active_user',
        columnNames: ['resource_id', 'user_id'],
        isUnique: true,
        where: 'deleted_at IS NULL',
      }),
    );
    await queryRunner.createIndex(
      'resource_collaborators',
      new TableIndex({
        name: 'idx_resource_collaborators_order',
        columnNames: ['resource_id', 'first_collaborated_at'],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'namespace_member_name_snapshots',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          { name: 'namespace_id', type: 'character varying' },
          { name: 'user_id', type: 'uuid' },
          { name: 'label', type: 'text' },
          ...BaseColumns(),
        ],
      }),
      true,
      true,
      true,
    );
    await queryRunner.createForeignKeys('namespace_member_name_snapshots', [
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
      }),
    ]);
    await queryRunner.createIndex(
      'namespace_member_name_snapshots',
      new TableIndex({
        name: 'uq_namespace_member_name_snapshots_active',
        columnNames: ['namespace_id', 'user_id'],
        isUnique: true,
        where: 'deleted_at IS NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable(
      'namespace_member_name_snapshots',
      true,
      true,
      true,
    );
    await queryRunner.dropTable('resource_collaborators', true, true, true);
  }
}
