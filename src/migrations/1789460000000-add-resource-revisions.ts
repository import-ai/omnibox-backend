import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

import { BaseColumns } from './base-columns';

export class AddResourceRevisions1789460000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'resource_revisions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          { name: 'namespace_id', type: 'character varying' },
          { name: 'resource_id', type: 'character varying' },
          { name: 'author_id', type: 'uuid', isNullable: true },
          { name: 'name', type: 'character varying' },
          { name: 'content', type: 'text' },
          { name: 'content_hash', type: 'character varying', length: '64' },
          ...BaseColumns(),
        ],
        foreignKeys: [
          {
            columnNames: ['namespace_id'],
            referencedTableName: 'namespaces',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
          {
            columnNames: ['resource_id'],
            referencedTableName: 'resources',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
          {
            columnNames: ['author_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          },
        ],
      }),
      true,
      true,
      true,
    );
    await queryRunner.createIndex(
      'resource_revisions',
      new TableIndex({
        name: 'idx_resource_revisions_resource_created',
        columnNames: ['namespace_id', 'resource_id', 'created_at'],
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('resource_revisions');
  }
}
