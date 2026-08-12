import generateId from 'omniboxd/utils/generate-id';
import { MigrationInterface, QueryRunner } from 'typeorm';

// One live rss_items row joined to everything needed to materialize it as a
// resource.
interface LegacyRssItem {
  title: string | null;
  pub_date: Date | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  link_id: string;
  url: string;
  folder_id: string;
  namespace_id: string;
  user_id: string | null;
  guid: string;
  parsed_content: string | null;
  // The serialized feed item (JSON), as stored by the poller.
  content: string | null;
}

interface SerializedFeedItem {
  link?: unknown;
  content?: unknown;
  contentSnippet?: unknown;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

// The stored blob is always JSON written by the poller, but a hand-written or
// legacy row must not abort the migration.
function parseFeedItem(raw: string | null): SerializedFeedItem {
  if (!raw) {
    return {};
  }
  try {
    return (JSON.parse(raw) as SerializedFeedItem) ?? {};
  } catch {
    return {};
  }
}

// Promotes every rss_items join row to a real `rss_item` resource parented to
// its rss folder. Items stop being globally deduped: each subscribing folder
// gets its own copy, which is what makes them ordinary resources. The global
// (url, guid) fetch/parse cache (rss_item_contents) is untouched, so nothing is
// re-fetched or re-parsed.
export class AddRssItemResources1786534451795 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ALTER TYPE ... ADD VALUE cannot run inside a transaction block, so commit
    // the migration's surrounding transaction around it (mirrors how
    // add-rss-links introduced 'rss_folder'). Committing it separately also
    // makes the new label usable by the statements below.
    await queryRunner.commitTransaction();
    await queryRunner.query(`
      ALTER TYPE resource_type ADD VALUE IF NOT EXISTS 'rss_item'
    `);
    await queryRunner.startTransaction();

    const legacyTable = await queryRunner.getTable('rss_items');
    if (legacyTable) {
      await this.backfill(queryRunner);
    }

    // Identity of an item resource is (link, guid), not its name: feeds repeat
    // titles freely. Deliberately covers soft-deleted rows so a removed item is
    // never resurrected as a duplicate by a later poll.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_resources_rss_item_identity
        ON resources ((attrs->>'link_id'), (attrs->>'guid'))
        WHERE resource_type = 'rss_item'
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS rss_items`);
  }

  private async backfill(queryRunner: QueryRunner): Promise<void> {
    // Skips rows whose folder resource no longer exists (the join drops them).
    const rows: LegacyRssItem[] = await queryRunner.query(`
      SELECT item.title,
             item.pub_date,
             item.created_at,
             item.updated_at,
             item.deleted_at,
             link.id AS link_id,
             link.url AS url,
             folder.id AS folder_id,
             folder.namespace_id AS namespace_id,
             folder.user_id AS user_id,
             content.guid AS guid,
             content.parsed_content AS parsed_content,
             content.content AS content
        FROM rss_items item
        JOIN rss_links link ON link.id = item.link_id
        JOIN rss_item_contents content ON content.id = item.content_id
        JOIN resources folder ON folder.id = link.resource_id
    `);
    if (rows.length === 0) {
      return;
    }

    // (link, guid) is the new identity; a legacy table could in principle hold
    // two rows collapsing to the same pair, which the unique index below would
    // reject. Keep the first.
    const seen = new Set<string>();
    // Bytes of content materialized per owner, keyed by namespace and user.
    // Accumulated from the rows actually inserted rather than re-aggregated from
    // the table, so the usage delta can never count anything twice.
    const usageByOwner = new Map<string, number>();
    for (const row of rows) {
      const identity = `${row.link_id}:${row.guid}`;
      if (seen.has(identity)) {
        continue;
      }
      seen.add(identity);

      const feedItem = parseFeedItem(row.content);
      const content =
        row.parsed_content ||
        asString(feedItem.contentSnippet) ||
        asString(feedItem.content) ||
        '';
      const attrs = {
        link_id: row.link_id,
        guid: row.guid,
        url: row.url,
        article_url: asString(feedItem.link),
        published_at: row.pub_date ? row.pub_date.toISOString() : null,
      };
      const contentSize = Buffer.byteLength(content, 'utf8');
      // A soft-deleted resource's content is excluded from usage everywhere
      // else, so only live rows are counted.
      if (row.deleted_at === null && row.user_id !== null && contentSize > 0) {
        const owner = `${row.namespace_id}:${row.user_id}`;
        usageByOwner.set(owner, (usageByOwner.get(owner) ?? 0) + contentSize);
      }
      await queryRunner.query(
        `INSERT INTO resources (
           id, namespace_id, user_id, parent_id, name, resource_type,
           content, content_size, attrs,
           created_at, updated_at, deleted_at
         ) VALUES (
           $1, $2, $3, $4, $5, 'rss_item', $6, $7, $8::jsonb, $9, $10, $11
         )`,
        [
          generateId(16),
          row.namespace_id,
          row.user_id,
          row.folder_id,
          row.title ?? '',
          content,
          contentSize,
          JSON.stringify(attrs),
          row.pub_date ?? row.created_at,
          row.updated_at,
          row.deleted_at,
        ],
      );
    }

    // Keep quota accounting consistent with the content just materialized: the
    // owner of each rss folder now stores its items' bodies.
    for (const [owner, amount] of usageByOwner) {
      const [namespaceId, userId] = owner.split(':');
      await queryRunner.query(
        `INSERT INTO storage_usages (namespace_id, user_id, storage_type, amount)
         VALUES ($1, $2, 'content', $3)
         ON CONFLICT (namespace_id, user_id, storage_type)
           WHERE deleted_at IS NULL
           DO UPDATE SET amount = storage_usages.amount + EXCLUDED.amount,
                         updated_at = now()`,
        [namespaceId, userId, amount],
      );
    }
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
