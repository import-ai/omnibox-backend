import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddNumSchedulesToTasks1784095735711 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'tasks',
      new TableColumn({
        name: 'num_schedules',
        type: 'integer',
        isNullable: false,
        default: 0,
      }),
    );
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
