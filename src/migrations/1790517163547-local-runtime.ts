import { MigrationInterface, QueryRunner, Table } from 'typeorm';

import { BaseColumns } from './base-columns';

export class LocalRuntime1790517163547 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.createTable(
      new Table({
        name: 'local_devices',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'user_id', type: 'uuid' },
          ...['name', 'platform', 'shell', 'secret_hash'].map((name) => ({
            name,
            type: 'varchar',
          })),
          { name: 'command_policy', type: 'varchar', default: "'ask'" },
          { name: 'paused', type: 'boolean', default: false },
          ...['last_seen_at', 'revoked_at'].map((name) => ({
            name,
            type: 'timestamptz',
            isNullable: true,
          })),
          ...BaseColumns(),
        ],
        indices: [{ columnNames: ['user_id'] }],
        foreignKeys: [
          {
            columnNames: ['user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
    );
    await q.createTable(
      new Table({
        name: 'local_executions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          ...['user_id', 'device_id', 'conversation_id'].map((name) => ({
            name,
            type: 'uuid',
          })),
          ...['namespace_id', 'tool_call_id'].map((name) => ({
            name,
            type: 'varchar',
          })),
          ...['command', 'cwd'].map((name) => ({ name, type: 'text' })),
          { name: 'timeout_seconds', type: 'integer' },
          { name: 'approvals', type: 'jsonb', default: "'[]'" },
          { name: 'status', type: 'varchar', default: "'queued'" },
          ...['sequence', 'delivery_version'].map((name) => ({
            name,
            type: 'integer',
            default: 0,
          })),
          ...[
            'deliver_after',
            'approval_expires_at',
            'approved_at',
            'started_at',
            'finished_at',
          ].map((name) => ({ name, type: 'timestamptz', isNullable: true })),
          { name: 'exit_code', type: 'integer', isNullable: true },
          ...BaseColumns(),
        ],
        indices: [
          {
            columnNames: ['user_id', 'conversation_id', 'tool_call_id'],
            isUnique: true,
          },
          { columnNames: ['device_id', 'status'] },
        ],
        foreignKeys: [
          {
            columnNames: ['device_id'],
            referencedTableName: 'local_devices',
            referencedColumnNames: ['id'],
          },
          {
            columnNames: ['user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
    );
    await q.createTable(
      new Table({
        name: 'local_execution_events',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          { name: 'execution_id', type: 'uuid' },
          { name: 'sequence', type: 'integer' },
          { name: 'kind', type: 'varchar' },
          { name: 'data', type: 'text' },
        ],
        indices: [
          { columnNames: ['execution_id', 'sequence'], isUnique: true },
        ],
        foreignKeys: [
          {
            columnNames: ['execution_id'],
            referencedTableName: 'local_executions',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.dropTable('local_execution_events');
    await q.dropTable('local_executions');
    await q.dropTable('local_devices');
  }
}
