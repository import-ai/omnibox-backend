import { MigrationInterface, QueryRunner } from 'typeorm';

export class NullUserEmail1752814358259 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE users ALTER COLUMN email DROP NOT NULL`,
    );
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
