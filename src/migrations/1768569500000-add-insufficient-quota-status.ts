import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInsufficientQuotaStatus1768569500000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'insufficient_quota';
    `);
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
