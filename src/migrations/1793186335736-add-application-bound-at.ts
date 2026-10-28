import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Marks a binding completed through the bot's verified callback. Clients
 * create application rows without it, and login only trusts bound rows.
 */
export class AddApplicationBoundAt1793186335736 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'applications',
      new TableColumn({
        name: 'bound_at',
        type: 'timestamptz',
        isNullable: true,
      }),
    );
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
