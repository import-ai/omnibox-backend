import { QueryRunner } from 'typeorm';

function assertRollbackTransaction(queryRunner: QueryRunner): void {
  if (!queryRunner.isTransactionActive) {
    throw new Error(
      'Comment schema rollback must run in a transaction with backend writers drained.',
    );
  }
}

export async function assertEmptyCommentAttachments(
  queryRunner: QueryRunner,
): Promise<void> {
  assertRollbackTransaction(queryRunner);
  await queryRunner.query(`
    LOCK TABLE resource_comment_attachments IN ACCESS EXCLUSIVE MODE;
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM resource_comment_attachments) THEN
        RAISE EXCEPTION 'Cannot roll back comment attachments while object cleanup or storage charge records remain. Roll back application code only, retaining the schema; see docs/resource-comments-release.md.';
      END IF;
    END $$;
  `);
}

export async function assertCompatibleCommentAnchors(
  queryRunner: QueryRunner,
): Promise<void> {
  assertRollbackTransaction(queryRunner);
  await queryRunner.query(`
    LOCK TABLE resource_comment_threads IN ACCESS EXCLUSIVE MODE;
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM resource_comment_threads
        WHERE deleted_at IS NULL AND resolved_at IS NULL
        GROUP BY resource_id, content_hash, anchor_from, anchor_to HAVING COUNT(*) > 1
      ) THEN
        RAISE EXCEPTION 'Cannot restore the old unique anchor index: valid multiple unresolved threads share an anchor. Roll back application code only and retain the comment schema; do not delete or resolve comments to force rollback.';
      END IF;
    END $$;
  `);
}
