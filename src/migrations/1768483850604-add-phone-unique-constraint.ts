import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPhoneUniqueConstraint1768483850604 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add unique index on (login_type, login_id) to prevent duplicate phone bindings
    // This prevents the same phone number from being bound to multiple users
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_user_bindings_login_type_login_id"
      ON "user_bindings" ("login_type", "login_id")
      WHERE "deleted_at" IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IDX_user_bindings_login_type_login_id"`,
    );
  }
}
