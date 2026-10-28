import { MigrationInterface, QueryRunner } from 'typeorm';

import { assertNoDocumentCommentThreads } from './comment-rollback-guards';

export class AddDocumentComments1792575770997 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE resource_comment_threads
        ADD COLUMN type character varying NOT NULL DEFAULT 'inline',
        ALTER COLUMN anchor_from DROP NOT NULL,
        ALTER COLUMN anchor_to DROP NOT NULL,
        ALTER COLUMN anchor_prefix DROP NOT NULL,
        ALTER COLUMN anchor_suffix DROP NOT NULL,
        ALTER COLUMN content_hash DROP NOT NULL,
        ALTER COLUMN anchor_status DROP NOT NULL;
      ALTER TABLE resource_comment_threads
        ADD CONSTRAINT ck_resource_comment_threads_type_anchor CHECK (
          (type = 'document' AND quoted_text = ''
            AND anchor_from IS NULL AND anchor_to IS NULL
            AND anchor_prefix IS NULL AND anchor_suffix IS NULL
            AND content_hash IS NULL AND anchor_status IS NULL)
          OR
          (type = 'inline' AND anchor_from IS NOT NULL AND anchor_from >= 0
            AND anchor_to IS NOT NULL AND anchor_to > anchor_from
            AND anchor_prefix IS NOT NULL AND anchor_suffix IS NOT NULL
            AND content_hash IS NOT NULL AND content_hash ~ '^[0-9a-f]{64}$'
            AND anchor_status IS NOT NULL AND anchor_status IN ('active', 'orphaned'))
        );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Retain soft-deleted document rows for recovery and attachment accounting.
    await assertNoDocumentCommentThreads(queryRunner);
    await queryRunner.query(`
      ALTER TABLE resource_comment_threads
        DROP CONSTRAINT ck_resource_comment_threads_type_anchor,
        ALTER COLUMN anchor_from SET NOT NULL,
        ALTER COLUMN anchor_to SET NOT NULL,
        ALTER COLUMN anchor_prefix SET NOT NULL,
        ALTER COLUMN anchor_suffix SET NOT NULL,
        ALTER COLUMN content_hash SET NOT NULL,
        ALTER COLUMN anchor_status SET NOT NULL,
        DROP COLUMN type;
    `);
  }
}
