import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillUserEmailFromOauthBindings1784109716584 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      WITH candidates AS (
        SELECT DISTINCT ON ("user_bindings"."user_id")
          "user_bindings"."user_id",
          lower(btrim("user_bindings"."metadata"->>'email')) AS "email"
        FROM "user_bindings"
        INNER JOIN "users" ON "users"."id" = "user_bindings"."user_id"
        WHERE "users"."email" IS NULL
          AND "users"."deleted_at" IS NULL
          AND "user_bindings"."deleted_at" IS NULL
          AND "user_bindings"."login_type" IN ('google', 'apple')
          AND "user_bindings"."metadata"->>'email' IS NOT NULL
          AND btrim("user_bindings"."metadata"->>'email') ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
        ORDER BY
          "user_bindings"."user_id",
          CASE "user_bindings"."login_type"
            WHEN 'google' THEN 0
            WHEN 'apple' THEN 1
          END,
          "user_bindings"."id" ASC
      ),
      safe_candidates AS (
        SELECT "user_id", "email"
        FROM (
          SELECT
            "user_id",
            "email",
            COUNT(*) OVER (PARTITION BY "email") AS "email_count"
          FROM "candidates"
        ) AS "deduplicated_candidates"
        WHERE "email_count" = 1
          AND NOT EXISTS (
            SELECT 1
            FROM "users" AS "existing_users"
            WHERE "existing_users"."deleted_at" IS NULL
              AND lower("existing_users"."email") = "deduplicated_candidates"."email"
          )
      )
      UPDATE "users"
      SET "email" = "safe_candidates"."email"
      FROM "safe_candidates"
      WHERE "users"."id" = "safe_candidates"."user_id"
        AND "users"."email" IS NULL
        AND "users"."deleted_at" IS NULL;
    `);
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
