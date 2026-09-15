import { MigrationInterface, QueryRunner, TableForeignKey } from 'typeorm';

import {
  assertCompatibleCommentAnchors,
  assertEmptyCommentAttachments,
} from './comment-rollback-guards';

export class AccountCommentAttachments1789383186349 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE resource_comment_attachments
        ADD COLUMN storage_user_id uuid,
        ADD COLUMN uploaded_at timestamptz;

      UPDATE resource_comment_attachments a SET storage_user_id = COALESCE(
        a.uploader_id,
        (SELECT r.user_id FROM resources r WHERE r.id = a.resource_id),
        (SELECT m.user_id FROM namespace_members m
         WHERE m.namespace_id = a.namespace_id AND m.role = 'owner'
           AND m.deleted_at IS NULL ORDER BY m.created_at LIMIT 1)
      );

      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM resource_comment_attachments WHERE storage_user_id IS NULL) THEN
          RAISE EXCEPTION 'Cannot account comment attachments without an uploader, resource owner or namespace owner. Restore ownership before retrying this migration.';
        END IF;
      END $$;

      INSERT INTO storage_usages (namespace_id, user_id, storage_type, amount)
      SELECT namespace_id, storage_user_id, 'attachment'::storage_type, SUM(size)::bigint
      FROM resource_comment_attachments WHERE storage_user_id IS NOT NULL
      GROUP BY namespace_id, storage_user_id
      ON CONFLICT (namespace_id, user_id, storage_type) WHERE deleted_at IS NULL
      DO UPDATE SET amount = storage_usages.amount + EXCLUDED.amount;

      CREATE INDEX idx_comment_attachments_cleanup ON resource_comment_attachments (updated_at);
    `);
    // Keep object keys for cleanup even when a resource is physically removed.
    const table = await queryRunner.getTable('resource_comment_attachments');
    if (!table) {
      throw new Error('Comment attachment table is missing');
    }
    for (const foreignKey of [...table.foreignKeys]) {
      if (
        foreignKey.columnNames.some((name) =>
          ['namespace_id', 'resource_id'].includes(name),
        )
      ) {
        await queryRunner.dropForeignKey(table, foreignKey);
      }
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Never discard object cleanup records or reverse an obsolete backfill total.
    // With no attachment records left, cleanup has already refunded their charges.
    await assertCompatibleCommentAnchors(queryRunner);
    await assertEmptyCommentAttachments(queryRunner);
    await queryRunner.query(`
      DROP INDEX idx_comment_attachments_cleanup;
      ALTER TABLE resource_comment_attachments DROP COLUMN storage_user_id, DROP COLUMN uploaded_at;
    `);
    for (const [column, table] of [
      ['namespace_id', 'namespaces'],
      ['resource_id', 'resources'],
    ]) {
      await queryRunner.createForeignKey(
        'resource_comment_attachments',
        new TableForeignKey({
          columnNames: [column],
          referencedTableName: table,
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );
    }
  }
}
