import { MigrationInterface, QueryRunner, Table, TableCheck } from 'typeorm';
import { BaseColumns } from './base-columns';

export class AddNotifications1776070800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE notification_status AS ENUM (
        'unread',
        'read'
      );
    `);

    const table = new Table({
      name: 'notifications',
      columns: [
        {
          name: 'id',
          type: 'uuid',
          isPrimary: true,
          default: 'uuid_generate_v4()',
        },
        {
          name: 'user_id',
          type: 'uuid',
          isNullable: true,
        },
        {
          name: 'namespace_id',
          type: 'character varying',
          isNullable: true,
        },
        {
          name: 'title',
          type: 'character varying',
          isNullable: false,
        },
        {
          name: 'content',
          type: 'text',
          isNullable: true,
        },
        {
          name: 'status',
          type: 'notification_status',
          isNullable: false,
          default: "'unread'::notification_status",
        },
        {
          name: 'notification_type',
          type: 'character varying',
          length: '32',
          isNullable: false,
        },
        {
          name: 'target',
          type: 'jsonb',
          isNullable: false,
          default: "'{}'::jsonb",
        },
        {
          name: 'tags',
          type: 'text',
          isArray: true,
          isNullable: false,
          default: "'{}'",
        },
        {
          name: 'attrs',
          type: 'jsonb',
          isNullable: false,
          default: "'{}'::jsonb",
        },
        {
          name: 'read_at',
          type: 'timestamp with time zone',
          isNullable: true,
        },
        ...BaseColumns(),
      ],
      indices: [
        {
          name: 'idx_notifications_user_created_at',
          columnNames: ['user_id', 'created_at'],
        },
        {
          name: 'idx_notifications_user_status_created_at',
          columnNames: ['user_id', 'status', 'created_at'],
          where: 'deleted_at IS NULL',
        },
      ],
      foreignKeys: [
        {
          columnNames: ['user_id'],
          referencedTableName: 'users',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        },
        {
          columnNames: ['namespace_id'],
          referencedTableName: 'namespaces',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        },
      ],
      checks: [
        new TableCheck({
          name: 'chk_notifications_user_or_namespace',
          expression: '"user_id" IS NOT NULL OR "namespace_id" IS NOT NULL',
        }),
      ],
    });

    await queryRunner.createTable(table, true, true, true);
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
