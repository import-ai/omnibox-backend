import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

import { BaseColumns } from './base-columns';

export class AddResourceCommentAttachments1788345621847 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'resource_comment_attachments',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          { name: 'namespace_id', type: 'character varying' },
          { name: 'resource_id', type: 'character varying' },
          { name: 'uploader_id', type: 'uuid', isNullable: true },
          { name: 'comment_id', type: 'uuid', isNullable: true },
          { name: 'object_key', type: 'character varying' },
          { name: 'name', type: 'character varying' },
          { name: 'mimetype', type: 'character varying' },
          { name: 'size', type: 'integer' },
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
            columnNames: ['uploader_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          },
          {
            columnNames: ['comment_id'],
            referencedTableName: 'resource_comments',
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
      'resource_comment_attachments',
      new TableIndex({
        name: 'idx_resource_comment_attachments_comment',
        columnNames: ['comment_id'],
      }),
    );
    await queryRunner.createIndex(
      'resource_comment_attachments',
      new TableIndex({
        name: 'idx_resource_comment_attachments_resource',
        columnNames: ['namespace_id', 'resource_id'],
      }),
    );
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
