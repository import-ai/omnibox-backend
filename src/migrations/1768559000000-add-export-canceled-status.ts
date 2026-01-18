import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExportCanceledStatus1768559000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        ALTER TYPE export_status ADD VALUE 'canceled';
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END
      $$;
    `);
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
