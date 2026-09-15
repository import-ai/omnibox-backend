import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

import { BaseColumns } from './base-columns';

export class AddResourceComments1788162671606 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'resource_comment_threads',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          { name: 'namespace_id', type: 'character varying' },
          { name: 'resource_id', type: 'character varying' },
          { name: 'creator_id', type: 'uuid', isNullable: true },
          { name: 'quoted_text', type: 'text' },
          { name: 'anchor_from', type: 'integer' },
          { name: 'anchor_to', type: 'integer' },
          { name: 'anchor_prefix', type: 'text', default: "''" },
          { name: 'anchor_suffix', type: 'text', default: "''" },
          { name: 'content_hash', type: 'character varying', length: '64' },
          {
            name: 'anchor_status',
            type: 'character varying',
            default: "'active'",
          },
          { name: 'resolved_at', type: 'timestamptz', isNullable: true },
          { name: 'resolved_by_id', type: 'uuid', isNullable: true },
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
            columnNames: ['creator_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          },
          {
            columnNames: ['resolved_by_id'],
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
      'resource_comment_threads',
      new TableIndex({
        name: 'idx_resource_comment_threads_resource',
        columnNames: ['namespace_id', 'resource_id'],
      }),
    );
    await queryRunner.createIndex(
      'resource_comment_threads',
      new TableIndex({
        name: 'uq_resource_comment_threads_active_anchor',
        columnNames: [
          'resource_id',
          'content_hash',
          'anchor_from',
          'anchor_to',
        ],
        isUnique: true,
        where: 'deleted_at IS NULL AND resolved_at IS NULL',
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'resource_comments',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          { name: 'thread_id', type: 'uuid' },
          { name: 'author_id', type: 'uuid', isNullable: true },
          { name: 'content', type: 'text' },
          ...BaseColumns(),
        ],
        foreignKeys: [
          {
            columnNames: ['thread_id'],
            referencedTableName: 'resource_comment_threads',
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
      'resource_comments',
      new TableIndex({
        name: 'idx_resource_comments_thread',
        columnNames: ['thread_id', 'created_at'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('resource_comments');
    await queryRunner.dropTable('resource_comment_threads');
  }
}
