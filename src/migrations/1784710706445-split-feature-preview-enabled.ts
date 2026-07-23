import { MigrationInterface, QueryRunner } from 'typeorm';

export class SplitFeaturePreviewEnabled1784710706445 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE feature_previews
      RENAME COLUMN enabled TO user_enabled
    `);
    await queryRunner.query(`
      ALTER TABLE feature_previews
      ALTER COLUMN user_enabled DROP DEFAULT,
      ALTER COLUMN user_enabled DROP NOT NULL,
      ADD COLUMN rollout_enabled boolean
    `);
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
