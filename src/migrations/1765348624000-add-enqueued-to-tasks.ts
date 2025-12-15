import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddEnqueuedToTasks1765348624000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'tasks',
      new TableColumn({
        name: 'enqueued',
        type: 'boolean',
        default: false,
        isNullable: false,
      }),
    );
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
