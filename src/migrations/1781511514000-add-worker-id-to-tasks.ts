import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddWorkerIdToTasks1781511514000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'tasks',
      new TableColumn({
        name: 'worker_id',
        type: 'character varying',
        isNullable: true,
        default: null,
      }),
    );
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
