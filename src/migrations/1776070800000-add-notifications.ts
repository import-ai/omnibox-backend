import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { BaseColumns } from './base-columns';

export class AddNotifications1776070800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
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
          isNullable: false,
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
          type: 'character varying',
          length: '16',
          isNullable: false,
          default: "'unread'",
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
      ],
    });

    await queryRunner.createTable(table, true, true, true);
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
