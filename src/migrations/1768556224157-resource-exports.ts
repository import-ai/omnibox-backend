import { MigrationInterface, QueryRunner } from 'typeorm';

export class ResourceExports1768556224157 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create export_status enum type
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE export_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'canceled');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create resource_exports table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "resource_exports" (
        "id" varchar PRIMARY KEY,
        "namespace_id" varchar NOT NULL,
        "user_id" uuid NOT NULL,
        "resource_id" varchar NOT NULL,
        "status" export_status NOT NULL DEFAULT 'pending',
        "s3_key" varchar,
        "error_message" varchar,
        "total_resources" integer NOT NULL DEFAULT 0,
        "processed_resources" integer NOT NULL DEFAULT 0,
        "completed_at" timestamptz,
        "expires_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz
      );
    `);

    // Create indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_resource_exports_namespace_id"
      ON "resource_exports" ("namespace_id");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_resource_exports_user_id"
      ON "resource_exports" ("user_id");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_resource_exports_status"
      ON "resource_exports" ("status");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "resource_exports"`);
    await queryRunner.query(`DROP TYPE IF EXISTS export_status`);
  }
}
