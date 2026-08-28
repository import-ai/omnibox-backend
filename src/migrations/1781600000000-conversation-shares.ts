import { MigrationInterface, QueryRunner, Table } from 'typeorm';

import { BaseColumns } from './base-columns';

export class ConversationShares1781600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "CREATE TYPE conversation_share_status AS ENUM ('active', 'invalid')",
    );
    await queryRunner.query(
      "CREATE TYPE conversation_share_channel AS ENUM ('copy_link', 'wechat_session', 'wechat_timeline')",
    );

    await queryRunner.createTable(
      new Table({
        name: 'conversation_shares',
        columns: [
          { name: 'id', type: 'character varying', isPrimary: true },
          { name: 'namespace_id', type: 'character varying' },
          { name: 'source_conversation_id', type: 'uuid' },
          { name: 'user_id', type: 'uuid' },
          { name: 'title', type: 'character varying' },
          { name: 'summary', type: 'text' },
          {
            name: 'status',
            type: 'conversation_share_status',
            default: "'active'",
          },
          {
            name: 'invalidated_at',
            type: 'timestamp with time zone',
            isNullable: true,
          },
          ...BaseColumns(),
        ],
        foreignKeys: [
          {
            columnNames: ['namespace_id'],
            referencedTableName: 'namespaces',
            referencedColumnNames: ['id'],
          },
          {
            columnNames: ['user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
          },
        ],
        indices: [
          { columnNames: ['source_conversation_id', 'status'] },
          { columnNames: ['status'] },
        ],
      }),
      true,
      true,
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'conversation_share_groups',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            isGenerated: true,
          },
          { name: 'share_id', type: 'character varying' },
          { name: 'ordinal', type: 'integer' },
          { name: 'question_content', type: 'text' },
          { name: 'answer_content', type: 'text' },
          ...BaseColumns(),
        ],
        foreignKeys: [
          {
            columnNames: ['share_id'],
            referencedTableName: 'conversation_shares',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
        indices: [{ columnNames: ['share_id', 'ordinal'], isUnique: true }],
      }),
      true,
      true,
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'conversation_share_events',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            isGenerated: true,
          },
          { name: 'share_id', type: 'character varying' },
          { name: 'channel', type: 'conversation_share_channel' },
          { name: 'result', type: 'character varying' },
          { name: 'failure_code', type: 'character varying', isNullable: true },
          ...BaseColumns(),
        ],
        foreignKeys: [
          {
            columnNames: ['share_id'],
            referencedTableName: 'conversation_shares',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
        indices: [{ columnNames: ['share_id', 'created_at'] }],
      }),
      true,
      true,
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('conversation_share_events', true, true, true);
    await queryRunner.dropTable('conversation_share_groups', true, true, true);
    await queryRunner.dropTable('conversation_shares', true, true, true);
    await queryRunner.query('DROP TYPE IF EXISTS conversation_share_channel');
    await queryRunner.query('DROP TYPE IF EXISTS conversation_share_status');
  }
}
