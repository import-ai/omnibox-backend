import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Serve the done-time dedup lookups for message index and memory tasks, which
 * otherwise scan every task row while the final message is locked. Built
 * concurrently because tasks takes inserts on every chat turn and worker poll.
 */
export class AddTaskDedupIndexes1792142626851 implements MigrationInterface {
  public readonly transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_message_index_dedup
       ON tasks (namespace_id, (input ->> 'conversation_id'), (input ->> 'message_id'))
       WHERE function = 'upsert_message_index'`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_memory_dedup
       ON tasks (namespace_id, (input ->> 'conversation_id'), (input ->> 'final_message_id'))
       WHERE function = 'update_memory'`,
    );
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
