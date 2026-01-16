import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPhoneUniqueConstraint1768483850604 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Handle existing duplicate records before creating unique index
    // Keep the oldest record (by created_at) and soft-delete newer duplicates
    await queryRunner.query(`
      WITH ranked_bindings AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY "login_type", "login_id"
            ORDER BY "created_at" ASC
          ) as rn
        FROM "user_bindings"
        WHERE "deleted_at" IS NULL
      )
      UPDATE "user_bindings"
      SET
        "deleted_at" = NOW(),
        "updated_at" = NOW()
      WHERE "id" IN (
        SELECT "id" FROM ranked_bindings WHERE rn > 1
      );
    `);

    // Step 2: Add unique index on (login_type, login_id) to prevent duplicate bindings
    // This prevents the same login identifier (e.g., phone, wechat id) from being bound to multiple users
    // Use IF NOT EXISTS for idempotency in case migration is re-run
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_user_bindings_login_type_login_id"
      ON "user_bindings" ("login_type", "login_id")
      WHERE "deleted_at" IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_user_bindings_login_type_login_id"`,
    );
  }
}
