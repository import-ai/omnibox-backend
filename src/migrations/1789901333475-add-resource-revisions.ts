import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

import { BaseColumns } from './base-columns';

export class AddResourceRevisions1789901333475 implements MigrationInterface {
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
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await queryRunner.query(`
      INSERT INTO resource_revisions (
        namespace_id,
        resource_id,
        author_id,
        name,
        content,
        content_hash,
        created_at,
        updated_at
      )
      SELECT
        r.namespace_id,
        r.id,
        r.user_id,
        r.name,
        COALESCE(r.content, ''),
        encode(digest(convert_to(COALESCE(r.content, ''), 'UTF8'), 'sha256'), 'hex'),
        r.created_at,
        r.created_at
      FROM resources r
      WHERE r.deleted_at IS NULL
        AND r.resource_type = 'doc'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('resource_revisions');
  }
}
