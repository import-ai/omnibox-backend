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

// How many backfilled resources one index-task insert covers. Keeps the id
// array passed to Postgres bounded on a database with a long rss history.
const TASK_INSERT_CHUNK = 500;

// Promotes every rss_items join row to a real `rss_item` resource parented to
// its rss folder. Items stop being globally deduped: each subscribing folder
// gets its own copy, which is what makes them ordinary resources. The global
// (url, guid) fetch/parse cache (rss_item_contents) is untouched, so nothing is
// re-fetched or re-parsed, and rss_items itself is kept (retained but unused)
// rather than dropped.
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
    // titles freely. Restricted to live rows: a retired copy is history, so it
    // must not block the folder from getting a fresh copy of the same article
    // when the subscription comes back (see RssPollingService.linkItems).
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_resources_rss_item_identity
        ON resources ((attrs->>'link_id'), (attrs->>'guid'))
        WHERE resource_type = 'rss_item' AND deleted_at IS NULL
    `);

    // rss_items is deliberately left in place. Nothing reads or writes it any
    // more — item identity now lives in resources.attrs — but its rows are the
    // only record of the pre-resource era, so they are retained rather than
    // destroyed.
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
    const resourceIds: string[] = [];
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
      // Recorded on the row like any other resource's, but never added to
      // storage_usages: an rss item's bytes do not count against its owner's
      // quota (see STORAGE_EXEMPT_RESOURCE_TYPES), so a database created from
      // scratch starts out charging nothing for the rows backfilled here.
      const contentSize = Buffer.byteLength(content, 'utf8');
      const id = generateId(16);
      resourceIds.push(id);
      await queryRunner.query(
        `INSERT INTO resources (
           id, namespace_id, user_id, parent_id, name, resource_type,
           content, content_size, attrs,
           created_at, updated_at, deleted_at
         ) VALUES (
           $1, $2, $3, $4, $5, 'rss_item', $6, $7, $8::jsonb, $9, $10, $11
         )`,
        [
          id,
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

    await this.emitIndexTasks(queryRunner, resourceIds);
  }

  // Index tasks for the rows just backfilled. The inserts above go straight to
  // `resources`, bypassing ResourcesService.createResource and the
  // upsert_index task it emits for every new resource, so without this the
  // pre-upgrade articles would show up in the app but never in semantic
  // search — and no poll would repair that, since the poller only rewrites a
  // copy whose body differs from the cached parse, which these already match.
  //
  // Mirrors WizardTaskService.emitUpsertIndexTask: same function, input and
  // payload, minus the tags (a backfilled item has none). Priority 1 rather
  // than the live path's 5 so a long history queues behind ordinary user work;
  // the dispatcher takes the lowest priority first often enough that these
  // still drain. Rows with no owner, no body or already trashed are skipped,
  // exactly as the live path skips them.
  private async emitIndexTasks(
    queryRunner: QueryRunner,
    resourceIds: string[],
  ): Promise<void> {
    for (let i = 0; i < resourceIds.length; i += TASK_INSERT_CHUNK) {
      const chunk = resourceIds.slice(i, i + TASK_INSERT_CHUNK);
      await queryRunner.query(
        `INSERT INTO tasks (
           namespace_id, user_id, priority, function, input, payload, resource_id
         )
         SELECT resource.namespace_id,
                resource.user_id,
                1,
                'upsert_index',
                jsonb_build_object(
                  'title', resource.name,
                  'content', resource.content,
                  'meta_info', jsonb_build_object(
                    'user_id', resource.user_id,
                    'resource_id', resource.id,
                    'parent_id', resource.parent_id,
                    'resource_tag_ids', '[]'::jsonb,
                    'resource_tag_names', '[]'::jsonb
                  )
                ),
                jsonb_build_object('resource_id', resource.id),
                resource.id
           FROM resources resource
          WHERE resource.id = ANY($1)
            AND resource.user_id IS NOT NULL
            AND resource.deleted_at IS NULL
            AND coalesce(resource.content, '') <> ''`,
        [chunk],
      );
    }
  }

  public down(): Promise<void> {
    throw new Error('Not supported.');
  }
}
