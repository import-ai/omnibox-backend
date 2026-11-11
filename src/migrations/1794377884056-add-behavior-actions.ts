import { MigrationInterface, QueryRunner, Table } from 'typeorm';

import { BaseColumns } from './base-columns';
export class AddBehaviorActions1794377884056 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.createTable(
      new Table({
        name: 'behavior_actions',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'user_id', type: 'uuid' },
          { name: 'action_type', type: 'varchar' },
          { name: 'started_at', type: 'timestamptz' },
          { name: 'origin_platform', type: 'varchar' },
          { name: 'resource_id', type: 'varchar', isNullable: true },
          { name: 'file_id', type: 'varchar', isNullable: true },
          { name: 'status', type: 'varchar', default: "'pending'" },
          { name: 'result_at', type: 'timestamptz', isNullable: true },
          { name: 'emitted_at', type: 'timestamptz', isNullable: true },
          ...BaseColumns(),
        ],
        foreignKeys: [
          {
            columnNames: ['user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
        checks: [
          {
            name: 'behavior_actions_status',
            expression: "status IN ('pending','success','failed','cancelled')",
          },
          {
            name: 'behavior_actions_platform',
            expression: "origin_platform IN ('web','ios','android')",
          },
          {
            name: 'behavior_actions_type',
            expression:
              "action_type IN ('resource_add','resource_read','resource_edit','ai_conversation','annotation_comment','document_comment')",
          },
        ],
      }),
    );
    await runner.query(
      'CREATE INDEX behavior_actions_pending_delivery ON behavior_actions(result_at) WHERE emitted_at IS NULL',
    );
    await runner.query(
      'CREATE INDEX behavior_actions_initiation ON behavior_actions(user_id,started_at)',
    );
    await runner.query(
      "CREATE INDEX tasks_behavior_action ON tasks ((payload->'behavior_context'->>'action_id')) WHERE payload ? 'behavior_context'",
    );
    await runner.query(
      "CREATE INDEX messages_behavior_action ON messages ((attrs->>'behavior_action_id')) WHERE attrs ? 'behavior_action_id'",
    );
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP INDEX messages_behavior_action');
    await runner.query('DROP INDEX tasks_behavior_action');
    await runner.dropTable('behavior_actions');
  }
}
