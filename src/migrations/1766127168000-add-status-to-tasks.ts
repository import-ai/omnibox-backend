import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

async function createTaskStatusEnum(queryRunner: QueryRunner): Promise<void> {
  await queryRunner.query(`
    CREATE TYPE task_status AS ENUM (
      'pending',
      'running',
      'finished',
      'error',
      'canceled'
    );
  `);
}

export class AddStatusToTasks1766127168000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await createTaskStatusEnum(queryRunner);

    await queryRunner.addColumn(
      'tasks',
      new TableColumn({
        name: 'status',
        type: 'task_status',
        isNullable: false,
        default: "'pending'",
      }),
    );

    await queryRunner.query(`
      UPDATE tasks
      SET status = CASE
        WHEN canceled_at IS NOT NULL THEN 'canceled'::task_status
        WHEN exception IS NOT NULL AND exception::text != '{}' AND exception::text != 'null' THEN 'error'::task_status
        WHEN ended_at IS NOT NULL THEN 'finished'::task_status
        WHEN started_at IS NOT NULL THEN 'running'::task_status
        ELSE 'pending'::task_status
      END;
    `);
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
