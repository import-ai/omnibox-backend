import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserUsernameNotNull1763533615604 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE users
      SET username = 'user_' || id::text
      WHERE username IS NULL
    `);
    await queryRunner.query(
      `ALTER TABLE users ALTER COLUMN username SET NOT NULL`,
    );
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
