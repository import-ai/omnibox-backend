import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddLastHeartbeatToTasks1780652045516 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'tasks',
      new TableColumn({
        name: 'last_heartbeat',
        type: 'timestamp with time zone',
        isNullable: true,
      }),
    );
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
