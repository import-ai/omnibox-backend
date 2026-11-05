import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Indexes for looking up one user's resources/tasks/messages over a time
 * range, plus the global time ranges used to find recently active users.
 *
 * Each index is built concurrently and in its own statement: CREATE INDEX
 * CONCURRENTLY cannot run inside a transaction, and a multi-statement query
 * string is implicitly transactional. If a concurrent build fails it leaves
 * an index with indisvalid = false behind, and IF NOT EXISTS will not rebuild
 * that index; check pg_index.indisvalid for each name below and drop/recreate
 * (or REINDEX INDEX CONCURRENTLY) before relying on it. Two replicas can race
 * to build the same index because TypeORM has no cross-instance migration
 * lock; serialize the migration (or use an advisory lock) on deploy.
 *
 * migrationsRun executes these at boot, so a large table lengthens startup and
 * health-check time; deploy the migration separately if that is too slow.
 * The two messages indexes add write cost to every chat message; the tasks
 * and resources indexes add the same to task/resource inserts.
 */
export class AddUserLookupIndexes1793844103185 implements MigrationInterface {
  public readonly transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_resources_user_created_at
       ON resources (user_id, created_at)`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_resources_created_at
       ON resources (created_at)`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_user_ended_at
       ON tasks (user_id, ended_at)
       WHERE ended_at IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_ended_at
       ON tasks (ended_at)
       WHERE ended_at IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_user_resource
       ON tasks (user_id, resource_id)
       WHERE resource_id IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_user_created_at
       ON messages (user_id, created_at)`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_conversation_user_created_at
       ON messages (conversation_id, user_id, created_at)`,
    );
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
