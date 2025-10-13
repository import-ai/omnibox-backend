import { MigrationInterface, QueryRunner } from 'typeorm';

export class NullableUserId1757844448000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE conversations
      ALTER COLUMN user_id DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE messages
      ALTER COLUMN user_id DROP NOT NULL
    `);
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
