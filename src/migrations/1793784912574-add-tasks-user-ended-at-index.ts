import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Serves the key-action clip signal, which takes MIN(ended_at) over a user's
 * finished collect tasks. Built concurrently because tasks takes inserts on
 * every worker poll.
 */
export class AddTasksUserEndedAtIndex1793784912574 implements MigrationInterface {
  public readonly transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_user_ended_at
       ON tasks (user_id, ended_at)
       WHERE ended_at IS NOT NULL`,
    );
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
