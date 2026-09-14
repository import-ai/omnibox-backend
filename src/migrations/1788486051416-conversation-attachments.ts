import { MigrationInterface, QueryRunner, Table } from 'typeorm';

import { BaseColumns } from './base-columns';

export class ConversationAttachments1788486051416 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'conversation_attachments',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          {
            name: 'namespace_id',
            type: 'character varying',
            isNullable: false,
          },
          {
            name: 'conversation_id',
            type: 'uuid',
            isNullable: false,
          },
          { name: 'user_id', type: 'uuid', isNullable: false },
          { name: 'object_key', type: 'character varying', isNullable: false },
          { name: 'name', type: 'character varying', isNullable: false },
          {
            name: 'content_type',
            type: 'character varying',
            isNullable: false,
          },
          { name: 'size', type: 'bigint', isNullable: false },
          { name: 'expires_at', type: 'timestamptz', isNullable: false },
          { name: 'consumed_at', type: 'timestamptz', isNullable: true },
          ...BaseColumns(),
        ],
        indices: [
          { columnNames: ['namespace_id', 'conversation_id', 'user_id'] },
          { columnNames: ['expires_at'] },
        ],
        foreignKeys: [
          {
            columnNames: ['namespace_id'],
            referencedTableName: 'namespaces',
            referencedColumnNames: ['id'],
          },
          {
            columnNames: ['conversation_id'],
            referencedTableName: 'conversations',
            referencedColumnNames: ['id'],
          },
          {
            columnNames: ['user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
          },
        ],
      }),
      true,
      true,
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'conversation_attachment_resources',
        columns: [
          { name: 'conversation_attachment_id', type: 'uuid', isPrimary: true },
          { name: 'resource_id', type: 'character varying', isPrimary: true },
          {
            name: 'attachment_id',
            type: 'character varying',
            isNullable: false,
          },
          ...BaseColumns(),
        ],
        foreignKeys: [
          {
            columnNames: ['conversation_attachment_id'],
            referencedTableName: 'conversation_attachments',
            referencedColumnNames: ['id'],
          },
          {
            columnNames: ['resource_id'],
            referencedTableName: 'resources',
            referencedColumnNames: ['id'],
          },
        ],
      }),
      true,
      true,
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'message_attachments',
        columns: [
          { name: 'id', type: 'bigserial', isPrimary: true },
          { name: 'message_id', type: 'uuid', isNullable: false },
          { name: 'attachment_id', type: 'uuid', isNullable: false },
          { name: 'position', type: 'integer', isNullable: false },
          ...BaseColumns(),
        ],
        indices: [
          {
            columnNames: ['message_id', 'attachment_id'],
            isUnique: true,
          },
        ],
        foreignKeys: [
          {
            columnNames: ['message_id'],
            referencedTableName: 'messages',
            referencedColumnNames: ['id'],
          },
          {
            columnNames: ['attachment_id'],
            referencedTableName: 'conversation_attachments',
            referencedColumnNames: ['id'],
          },
        ],
      }),
      true,
      true,
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('message_attachments', true, true, true);
    await queryRunner.dropTable(
      'conversation_attachment_resources',
      true,
      true,
      true,
    );
    await queryRunner.dropTable('conversation_attachments', true, true, true);
  }
}
