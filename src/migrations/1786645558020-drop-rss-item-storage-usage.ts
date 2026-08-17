import { MigrationInterface, QueryRunner } from 'typeorm';

// Takes the rss item content that earlier releases charged back out of
// storage_usages. Items are poller-owned, read-only and stored once per
// subscribing folder, so their bytes no longer count against the owner's quota
// (see STORAGE_EXEMPT_RESOURCE_TYPES); the code paths stopped charging and
// refunding them in the same release as this migration.
//
// What was charged, exactly: createResource added an item's content_size when
// the item was created, updateResource followed every later body change (the
// parse fan-out replacing the seeded feed snippet), and the delete paths
// refunded the full content_size when the item was retired with its link or
// its folder. Restore never applied — an item is never individually restored —
// and purging only stamps permanent_deleted_at, so a retired item is charged
// nothing on either side. The charge left standing is therefore exactly the
// content_size of the LIVE items, per (namespace_id, user_id) — soft-deleted
// items have already been refunded, and items with no user_id were never
// charged.
export class DropRssItemStorageUsage1786645558020 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // The subtraction is capped at the part of the recorded amount that the
    // owner's live non-exempt resources do not account for, so it can only ever
    // give back bytes that rss items put there. That matters because
    // add-rss-item-resources no longer charges the items it backfills: on a
    // database that runs both migrations in one deployment there is nothing to
    // take back, the cap is 0 and the amount is left alone, while on a database
    // that already ran the charging version the cap exceeds the item bytes and
    // the full amount comes off. It also keeps the amount from going negative:
    // the subtrahend is never larger than the amount itself.
    await queryRunner.query(`
      WITH items AS (
        SELECT namespace_id, user_id, SUM(content_size)::bigint AS bytes
          FROM resources
         WHERE resource_type = 'rss_item'
           AND deleted_at IS NULL
           AND user_id IS NOT NULL
         GROUP BY namespace_id, user_id
      ), charged AS (
        -- Everything that does consume quota, i.e. every type but rss_item.
        SELECT namespace_id, user_id, SUM(content_size)::bigint AS bytes
          FROM resources
         WHERE resource_type <> 'rss_item'
           AND deleted_at IS NULL
           AND user_id IS NOT NULL
         GROUP BY namespace_id, user_id
      )
      UPDATE storage_usages AS usage
         SET amount = usage.amount - LEAST(
               items.bytes,
               GREATEST(usage.amount - COALESCE(charged.bytes, 0), 0)
             ),
             updated_at = now()
        FROM items
        LEFT JOIN charged USING (namespace_id, user_id)
       WHERE usage.namespace_id = items.namespace_id
         AND usage.user_id = items.user_id
         AND usage.storage_type = 'content'
         AND usage.deleted_at IS NULL
    `);
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
