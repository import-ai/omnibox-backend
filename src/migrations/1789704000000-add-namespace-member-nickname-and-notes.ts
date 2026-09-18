import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNamespaceMemberNicknameAndNotes1789704000000 implements MigrationInterface {
  name = 'AddNamespaceMemberNicknameAndNotes1789704000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "namespace_members" ADD COLUMN IF NOT EXISTS "nickname" character varying(64)`,
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "namespace_member_notes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "namespace_id" character varying NOT NULL,
        "author_user_id" character varying NOT NULL,
        "target_user_id" character varying NOT NULL,
        "note" character varying(128) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "pk_namespace_member_notes" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_namespace_member_notes_author_target"
      ON "namespace_member_notes" ("namespace_id", "author_user_id", "target_user_id")
      WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_namespace_member_notes_author_target"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "namespace_member_notes"`);
    await queryRunner.query(
      `ALTER TABLE "namespace_members" DROP COLUMN IF EXISTS "nickname"`,
    );
  }
}
