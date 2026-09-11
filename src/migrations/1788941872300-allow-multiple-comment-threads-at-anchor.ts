import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowMultipleCommentThreadsAtAnchor1788941872300 implements MigrationInterface {
  name = 'AllowMultipleCommentThreadsAtAnchor1788941872300';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "uq_resource_comment_threads_active_anchor"',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE UNIQUE INDEX "uq_resource_comment_threads_active_anchor" ON "resource_comment_threads" ("resource_id", "content_hash", "anchor_from", "anchor_to") WHERE "deleted_at" IS NULL AND "resolved_at" IS NULL',
    );
  }
}
