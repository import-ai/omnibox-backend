import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

export class AddStatusEnqueuedIndexToTasks1776071000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createIndex(
      'tasks',
      new TableIndex({
        columnNames: ['status', 'enqueued'],
      }),
    );
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
