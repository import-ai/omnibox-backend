import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { RssItemContent } from 'omniboxd/rss/entities/rss-item-content.entity';
import { RssLink } from 'omniboxd/rss/entities/rss-link.entity';
import { RssPoll, RssPollStatus } from 'omniboxd/rss/entities/rss-poll.entity';
import {
  ParsedFeedItem,
  RssFeedFetcherService,
} from 'omniboxd/rss/rss-feed-fetcher.service';
import { transaction } from 'omniboxd/utils/transaction-utils';
import { WizardAPIService } from 'omniboxd/wizard-api/wizard-api.service';
import { DataSource, In, Repository } from 'typeorm';

// Each URL is polled at most once within this window; an in-progress `polling`
// row also blocks re-polling until it finishes (see claim()). The same value
// bounds the per-worker deadline, so a worker never runs past the point where a
// later poll could re-claim its URL.
const POLL_WINDOW_MS = 5 * 60 * 1000;
const POLL_CONCURRENCY = 5;

// Default max number of items parsed in parallel within a single feed poll.
// Overridable via OBB_RSS_POLL_ITEM_CONCURRENCY.
const DEFAULT_ITEM_CONCURRENCY = 5;

// Hard cap on a single wizard parse. Without it a stalled wizard request would
// never settle and its batch's Promise.all — and thus the whole poll — would
// hang past the poll window, letting a later poll re-claim and overlap. On
// timeout the parse is recorded as a failed attempt and retried with backoff.
const WIZARD_PARSE_TIMEOUT_MS = 60 * 1000;

// A poll left in POLLING past this age is treated as dead (its worker crashed or
// was killed) and may be re-claimed; the stale row is marked failed. Comfortably
// larger than a healthy poll's bound (POLL_WINDOW_MS + one final wizard parse).
const POLL_STALE_MS = 2 * POLL_WINDOW_MS;

// A wizard parse that fails transiently (restart, timeout, network blip) leaves
// parsed_content null; the next polls retry it with exponential backoff until it
// succeeds or the attempt cap is reached, so an item is never stuck unparsed.
const MAX_PARSE_ATTEMPTS = 6;
const PARSE_BACKOFF_BASE_MS = 5 * 60 * 1000; // matches the poll cadence
const PARSE_BACKOFF_CAP_MS = 6 * 60 * 60 * 1000;

// The partial unique index that carries an rss item's (link_id, guid) identity
// among the live rows (see the add-rss-item-resources migration; it is
// restricted to deleted_at IS NULL). Postgres names it as the violated
// constraint, which is how a losing insert is told apart from any other unique
// violation raised while creating an item.
const RSS_ITEM_IDENTITY_INDEX = 'uq_resources_rss_item_identity';

// Delay before the nth failed attempt may be retried: 10m, 20m, 40m, ... capped.
function parseBackoffMs(attempts: number): number {
  return Math.min(PARSE_BACKOFF_CAP_MS, PARSE_BACKOFF_BASE_MS * 2 ** attempts);
}

export interface PollSummary {
  claimed: number;
  succeeded: number;
  failed: number;
}

// A stored feed item: the deduped content row id plus everything needed to
// materialize the item as a resource under each subscribing folder.
interface StoredItem {
  contentId: string;
  guid: string;
  title: string;
  pubDate: Date | null;
  // Body for the item resource: the parsed markdown once the wizard has
  // rendered it, otherwise the feed's own summary.
  content: string;
  articleUrl: string;
}

@Injectable()
export class RssPollingService {
  private readonly logger = new Logger(RssPollingService.name);
  // Max items parsed in parallel within one feed poll; bounds how long a single
  // large feed can occupy a poll slot before its per-worker deadline is checked.
  private readonly itemConcurrency: number;

  constructor(
    @InjectRepository(RssLink)
    private readonly rssLinkRepository: Repository<RssLink>,
    @InjectRepository(RssPoll)
    private readonly rssPollRepository: Repository<RssPoll>,
    @InjectRepository(RssItemContent)
    private readonly rssItemContentRepository: Repository<RssItemContent>,
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    private readonly dataSource: DataSource,
    private readonly feedFetcher: RssFeedFetcherService,
    private readonly wizardApiService: WizardAPIService,
    private readonly resourcesService: ResourcesService,
    configService: ConfigService,
  ) {
    // Clamp to >= 1 so a malformed value can never stall the loop.
    this.itemConcurrency = Math.max(
      1,
      parseInt(
        configService.get(
          'OBB_RSS_POLL_ITEM_CONCURRENCY',
          String(DEFAULT_ITEM_CONCURRENCY),
        ),
        10,
      ) || DEFAULT_ITEM_CONCURRENCY,
    );
  }

  async pollDueLinks(): Promise<PollSummary> {
    const rows = await this.rssLinkRepository
      .createQueryBuilder('link')
      .select('DISTINCT link.url', 'url')
      .getRawMany<{ url: string }>();
    const urls = rows.map((row) => row.url);

    const summary: PollSummary = { claimed: 0, succeeded: 0, failed: 0 };
    for (let i = 0; i < urls.length; i += POLL_CONCURRENCY) {
      const batch = urls.slice(i, i + POLL_CONCURRENCY);
      const results = await Promise.all(batch.map((url) => this.pollUrl(url)));
      for (const result of results) {
        if (result === 'skipped') {
          continue;
        }
        summary.claimed += 1;
        if (result === 'succeed') {
          summary.succeeded += 1;
        } else {
          summary.failed += 1;
        }
      }
    }
    return summary;
  }

  // Polls a single URL. Returns 'skipped' when another poll already claimed the
  // URL within the window, otherwise the resulting poll status. `maxRunMs` bounds
  // how long the worker keeps parsing items after it claimed the URL (defaults to
  // the claim window); a large feed is truncated at that deadline and its
  // remaining items resume on the next poll.
  async pollUrl(
    url: string,
    options?: { maxRunMs?: number },
  ): Promise<'skipped' | 'succeed' | 'failed'> {
    let poll: RssPoll | null = null;
    try {
      poll = await this.claim(url);
      if (poll === null) {
        return 'skipped';
      }
      // Bound the worker to the claim window: a poll that ran past it could
      // overlap a second poll that has re-claimed the same URL.
      const deadline = Date.now() + (options?.maxRunMs ?? POLL_WINDOW_MS);

      // Network I/O stays outside any transaction.
      const feed = await this.feedFetcher.fetchAndParse(url);
      if (feed === null) {
        await this.finishPoll(poll.id, RssPollStatus.FAILED, {
          error: 'fetch/parse failed',
        });
        return 'failed';
      }

      const stored = await this.storeItems(url, feed.items ?? [], deadline);
      // Give every folder subscribed to this url its own copy of each item.
      await this.linkItems(url, stored);
      const contentIds = stored.map((item) => item.contentId);
      await this.finishPoll(poll.id, RssPollStatus.SUCCEED, { contentIds });
      return 'succeed';
    } catch (err) {
      this.logger.error(
        `Failed to poll rss url ${url}: ${err instanceof Error ? err.message : String(err)}`,
      );
      if (poll !== null) {
        await this.finishPoll(poll.id, RssPollStatus.FAILED, {
          error: err instanceof Error ? err.message : String(err),
        }).catch(() => undefined);
      }
      return 'failed';
    }
  }

  // Race-safe claim across instances: serialize on the URL via an advisory lock,
  // then decide against the most recent poll for the url:
  //   - still POLLING and not yet stale -> another worker owns it, skip (this is
  //     what prevents two workers from polling the same url at once);
  //   - POLLING but older than POLL_STALE_MS -> its worker died mid-poll, mark it
  //     failed (stale recovery) and re-claim;
  //   - terminal but polled within POLL_WINDOW -> too soon, skip;
  //   - otherwise -> claim by inserting a fresh POLLING marker.
  private async claim(url: string): Promise<RssPoll | null> {
    return await transaction(this.dataSource.manager, async (tx) => {
      const manager = tx.entityManager;
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`rss-poll:${url}`],
      );

      const latest = await manager.findOne(RssPoll, {
        where: { url },
        order: { createdAt: 'DESC' },
      });
      if (latest !== null) {
        const ageMs = Date.now() - latest.createdAt.getTime();
        if (latest.status === RssPollStatus.POLLING) {
          if (ageMs < POLL_STALE_MS) {
            return null;
          }
          // Stale recovery: the previous worker never finished, so retire its row
          // before claiming so it can't be mistaken for an in-progress poll.
          await manager.update(RssPoll, latest.id, {
            status: RssPollStatus.FAILED,
            error: 'stale poll recovered',
          });
        } else if (ageMs < POLL_WINDOW_MS) {
          return null;
        }
      }

      const poll = manager.create(RssPoll, {
        url,
        status: RssPollStatus.POLLING,
        contentIds: [],
        error: null,
      });
      return await manager.save(RssPoll, poll);
    });
  }

  // Stores (and, where needed, parses) a feed's items, up to `itemConcurrency` at
  // a time. Stops launching new work once `deadline` (ms epoch) passes so one
  // huge feed can't monopolize a poll slot; items not reached this round are
  // stored/parsed on the next poll (unparsed contents re-parse via the
  // parsed_content-null path, unseen items are inserted then). An individual
  // in-flight Wizard parse is not interrupted — it is bounded by its own timeout.
  private async storeItems(
    url: string,
    items: ParsedFeedItem[],
    deadline: number,
  ): Promise<StoredItem[]> {
    const stored: StoredItem[] = [];
    for (let i = 0; i < items.length; i += this.itemConcurrency) {
      if (Date.now() >= deadline) {
        this.logger.warn(
          `Poll window elapsed for ${url}; processed ${i}/${items.length} items, ` +
            'remaining items will resume on the next poll',
        );
        break;
      }
      const batch = items.slice(i, i + this.itemConcurrency);
      const batchStored = await Promise.all(
        batch.map((item) => this.storeItem(url, item)),
      );
      stored.push(...batchStored);
    }
    return stored;
  }

  // Stores a single feed item's content and parses it when needed. Safe to run
  // in parallel with sibling items: each has a distinct guid, and the rare
  // duplicate guid is resolved by the (url, guid) ON CONFLICT.
  private async storeItem(
    url: string,
    item: ParsedFeedItem,
  ): Promise<StoredItem> {
    const {
      guid,
      content,
      title,
      pubDate,
      summary,
      articleUrl,
      articleContent,
    } = this.serializeItem(item);
    const {
      id,
      pubDate: effectivePubDate,
      parsedContent,
      parseAttempts,
      parseNextAttemptAt,
    } = await this.upsertItemContent(url, guid, content, title, pubDate);
    // Parse items that still have no parsed content: newly-inserted ones on the
    // spot, and previously-failed ones once their backoff has elapsed and while
    // attempts remain. Already-parsed items are never re-parsed, and items with
    // nothing to parse never accumulate attempts. The poll window keeps a url's
    // polls from overlapping, so no two polls parse the same row.
    const shouldParse =
      Boolean(articleUrl || articleContent) &&
      parsedContent === null &&
      parseAttempts < MAX_PARSE_ATTEMPTS &&
      (parseNextAttemptAt === null ||
        parseNextAttemptAt.getTime() <= Date.now());
    const freshlyParsed = shouldParse
      ? await this.parseItemContent(
          url,
          guid,
          id,
          parseAttempts,
          articleUrl,
          articleContent,
        )
      : null;
    // Use the stored pub_date (preserved from first fetch) so item resources for
    // newly-appearing links match the content row's publish date.
    return {
      contentId: id,
      guid,
      title,
      pubDate: effectivePubDate,
      content: freshlyParsed ?? parsedContent ?? summary,
      articleUrl,
    };
  }

  // Renders the article to Markdown via the wizard and stores it, then fans the
  // result out to every existing item resource for this (url, guid) — the same
  // article can be subscribed from several folders and namespaces, and each
  // holds its own copy. Returns the markdown so a copy created later in this
  // same poll starts out with it. When the feed embedded full content the wizard
  // converts that directly (no link fetch); otherwise it scrapes articleUrl.
  // Best-effort: a failure leaves parsed_content null and never fails the poll,
  // but it records the attempt so a later poll retries it after a backoff.
  // `attempts` is the number of attempts that have already failed for this item.
  private async parseItemContent(
    url: string,
    guid: string,
    contentId: string,
    attempts: number,
    articleUrl: string,
    articleContent: string,
  ): Promise<string | null> {
    let markdown: string;
    try {
      ({ markdown } = await this.wizardApiService.parseRssItem(
        {
          url: articleUrl,
          content: articleContent,
        },
        AbortSignal.timeout(WIZARD_PARSE_TIMEOUT_MS),
      ));
      // Empty markdown is a failed parse too: without counting it as an attempt
      // the item would be re-parsed on every poll forever.
      if (!markdown) {
        throw new Error('wizard returned empty markdown');
      }
      await this.rssItemContentRepository.update(contentId, {
        parsedContent: markdown,
        parseNextAttemptAt: null,
      });
    } catch (err) {
      this.logger.error(
        `Failed to parse rss item ${contentId} (${articleUrl}): ${err instanceof Error ? err.message : String(err)}`,
      );
      await this.recordParseFailure(contentId, attempts);
      return null;
    }

    // Storing the parse must not be undone by a fan-out failure, so this runs
    // outside the update above and only logs on error; the next poll re-runs it
    // for any copy left behind (content is compared before writing).
    try {
      await this.fanOutContent(url, guid, markdown);
    } catch (err) {
      this.logger.error(
        `Failed to fan out parsed content of rss item ${contentId} (${articleUrl}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return markdown;
  }

  // Pushes an item's freshly parsed markdown into every live resource copy of
  // it. Retired copies are deliberately skipped (the query builder filters them
  // out): their subscription is gone, and rewriting them would resurrect their
  // storage usage and search index entries.
  private async fanOutContent(
    url: string,
    guid: string,
    markdown: string,
  ): Promise<void> {
    const links = await this.rssLinkRepository.find({ where: { url } });
    if (links.length === 0) {
      return;
    }
    const resources = await this.resourceRepository
      .createQueryBuilder('resource')
      .where('resource.resource_type = :resourceType', {
        resourceType: ResourceType.RSS_ITEM,
      })
      .andWhere("resource.attrs->>'link_id' IN (:...linkIds)", {
        linkIds: links.map((link) => link.id),
      })
      .andWhere("resource.attrs->>'guid' = :guid", { guid })
      .getMany();

    for (const resource of resources) {
      if (resource.content === markdown || !resource.userId) {
        continue;
      }
      // Goes through the resource service so the content size, the owner's
      // storage usage and the search index all follow the new body. The item is
      // read-only to users, hence the internal write.
      await this.resourcesService.updateResource(
        resource.namespaceId,
        resource.id,
        resource.userId,
        { content: markdown },
        undefined,
        false,
        { internal: true },
      );
    }
  }

  // Schedules the next parse retry. Also best-effort: failing to record an
  // attempt must not fail the poll.
  private async recordParseFailure(
    contentId: string,
    attempts: number,
  ): Promise<void> {
    const parseAttempts = attempts + 1;
    try {
      await this.rssItemContentRepository.update(contentId, {
        parseAttempts,
        parseNextAttemptAt: new Date(
          Date.now() + parseBackoffMs(parseAttempts),
        ),
      });
    } catch (err) {
      this.logger.error(
        `Failed to record parse attempt ${parseAttempts} for rss item ${contentId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Gives every rss_links row sharing the polled url its own resource copy of
  // each stored item, one `rss_item` resource per (link, guid) pair. Items are
  // deliberately not deduped across folders: each folder owns its copies, in its
  // own namespace, under its own rss folder resource. Only pairs with no LIVE
  // copy are created: an existing live copy is left alone (a revised item is
  // refreshed through the parse fan-out rather than re-created, and a copy whose
  // feed title changed is renamed in place), while a retired copy is ignored so
  // a folder that re-subscribes to a url gets the article back as a fresh
  // resource next to the soft-deleted history. Nothing user-facing can retire an
  // individual item — items go only with their link or their folder — so a
  // retired copy is only ever reachable again through a re-subscription.
  //
  // Polls of one url do not normally overlap: claim() leaves a POLLING marker
  // that makes every later claim skip the url. That is a lock with a timeout,
  // though — after POLL_STALE_MS a second worker may take over a poll that is
  // merely slow rather than dead — so the read-then-insert below can still race.
  // The (link_id, guid) unique index is what actually guarantees a single copy;
  // a losing insert is dropped instead of failing the poll.
  private async linkItems(url: string, stored: StoredItem[]): Promise<void> {
    if (stored.length === 0) {
      return;
    }
    const links = await this.rssLinkRepository.find({ where: { url } });
    if (links.length === 0) {
      return;
    }

    // Skip links whose rss folder resource is gone (deleted or trashed) or has
    // no owner: there is nowhere to hang the items.
    const folders = await this.resourceRepository.find({
      where: { id: In(links.map((link) => link.resourceId)) },
    });
    const folderById = new Map(folders.map((folder) => [folder.id, folder]));

    // A feed can list the same guid twice; both collapse to one content row and
    // must produce a single resource per link.
    const itemByGuid = new Map<string, StoredItem>();
    for (const item of stored) {
      itemByGuid.set(item.guid, item);
    }
    const items = [...itemByGuid.values()];

    // Live copies only: a soft-deleted copy belongs to a subscription that is
    // gone, and the identity index no longer covers it, so it must not stand in
    // the way of a fresh copy.
    const existing = new Map(
      (
        await this.resourceRepository
          .createQueryBuilder('resource')
          .select('resource.id', 'id')
          .addSelect('resource.name', 'name')
          .addSelect("resource.attrs->>'link_id'", 'linkId')
          .addSelect("resource.attrs->>'guid'", 'guid')
          .where('resource.resource_type = :resourceType', {
            resourceType: ResourceType.RSS_ITEM,
          })
          .andWhere("resource.attrs->>'link_id' IN (:...linkIds)", {
            linkIds: links.map((link) => link.id),
          })
          .andWhere("resource.attrs->>'guid' IN (:...guids)", {
            guids: items.map((item) => item.guid),
          })
          .getRawMany<{
            id: string;
            name: string;
            linkId: string;
            guid: string;
          }>()
      ).map((row) => [`${row.linkId}:${row.guid}`, row]),
    );

    for (const link of links) {
      const folder = folderById.get(link.resourceId);
      if (!folder || !folder.userId) {
        continue;
      }
      for (const item of items) {
        const copy = existing.get(`${link.id}:${item.guid}`);
        if (copy) {
          await this.renameItemResource(folder, copy, item);
          continue;
        }
        await this.createItemResource(link, folder, item);
      }
    }
  }

  // Follows a corrected feed title on the live copy that already exists.
  // Retired copies never reach here: linkItems only looks up live ones, and a
  // retired copy is history that no later poll rewrites.
  private async renameItemResource(
    folder: Resource,
    copy: { id: string; name: string },
    item: StoredItem,
  ): Promise<void> {
    if (copy.name === item.title) {
      return;
    }
    await this.resourcesService.updateResource(
      folder.namespaceId,
      copy.id,
      folder.userId!,
      { name: item.title },
      undefined,
      false,
      { internal: true },
    );
  }

  private async createItemResource(
    link: RssLink,
    folder: Resource,
    item: StoredItem,
  ): Promise<void> {
    try {
      await this.insertItemResource(link, folder, item);
    } catch (err) {
      // An overlapping poll may have inserted this copy in between the
      // existence check and here; the identity index rejects the second insert
      // (it covers exactly the live rows that check looked at), which is the
      // outcome we want. Anything else — including another unique violation
      // raised further down the insert, such as two polls racing to create the
      // same owner's first storage-usage row — is a real failure and fails the
      // poll.
      if (!this.isDuplicateItemIdentityError(err)) {
        throw err;
      }
      this.logger.warn(
        `Skipped rss item ${item.guid} for link ${link.id}: its (link_id, guid) copy already exists`,
      );
    }
  }

  // Postgres unique_violation on the item's (link_id, guid) identity index,
  // however the driver wrapped it. Matched by constraint name rather than by
  // the 23505 code alone: an item insert also writes rows (storage usage, for
  // one) whose own unique constraints must never be swallowed here.
  private isDuplicateItemIdentityError(err: unknown): boolean {
    const error = err as {
      code?: string;
      constraint?: string;
      driverError?: { code?: string; constraint?: string };
    };
    const code = error?.driverError?.code ?? error?.code;
    const constraint = error?.driverError?.constraint ?? error?.constraint;
    return code === '23505' && constraint === RSS_ITEM_IDENTITY_INDEX;
  }

  private async insertItemResource(
    link: RssLink,
    folder: Resource,
    item: StoredItem,
  ): Promise<void> {
    await transaction(this.dataSource.manager, async (tx) => {
      const resource = await this.resourcesService.createResource(
        {
          namespaceId: folder.namespaceId,
          parentId: folder.id,
          userId: folder.userId,
          resourceType: ResourceType.RSS_ITEM,
          // Feed titles repeat and may contain slashes; the internal create
          // keeps them verbatim (identity is the guid, not the name).
          name: item.title,
          content: item.content,
          attrs: {
            link_id: link.id,
            guid: item.guid,
            // The feed url, plus the article's own url so a client can link out
            // to the original.
            url: link.url,
            article_url: item.articleUrl || null,
            published_at: item.pubDate ? item.pubDate.toISOString() : null,
          },
        },
        tx,
        false,
        { internal: true },
      );
      // The item was published before it was polled, and the folder lists items
      // newest-first by creation time.
      const createdAt = item.pubDate ?? new Date();
      await tx.entityManager.query(
        `UPDATE resources SET created_at = $1 WHERE id = $2`,
        [createdAt, resource.id],
      );
    });
  }

  // Deduplicates per (url, guid); refreshes the content/title of an existing
  // row on refetch, but preserves the original pub_date so a re-fetch never
  // moves an item's publish date (important for items whose date we defaulted
  // to the fetch time). Returns the row id, its effective pub_date and its parse
  // state. When the item's body actually changes the DO UPDATE drops the stale
  // parsed_content and resets the retry backoff, so the returned parse state
  // makes the caller re-parse the revised content; an unchanged refetch leaves
  // parsed_content and the retry bookkeeping untouched.
  private async upsertItemContent(
    url: string,
    guid: string,
    content: string,
    title: string,
    pubDate: Date | null,
  ): Promise<{
    id: string;
    pubDate: Date | null;
    parsedContent: string | null;
    parseAttempts: number;
    parseNextAttemptAt: Date | null;
  }> {
    const rows: Array<{
      id: string;
      pubDate: Date | null;
      parsedContent: string | null;
      parseAttempts: number;
      parseNextAttemptAt: Date | null;
    }> = await this.rssItemContentRepository.query(
      `INSERT INTO rss_item_contents (url, guid, content, title, pub_date)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (url, guid) DO UPDATE
         SET content = EXCLUDED.content,
             title = EXCLUDED.title,
             updated_at = now(),
             parsed_content = CASE
               WHEN rss_item_contents.content IS DISTINCT FROM EXCLUDED.content
               THEN NULL ELSE rss_item_contents.parsed_content END,
             parse_attempts = CASE
               WHEN rss_item_contents.content IS DISTINCT FROM EXCLUDED.content
               THEN 0 ELSE rss_item_contents.parse_attempts END,
             parse_next_attempt_at = CASE
               WHEN rss_item_contents.content IS DISTINCT FROM EXCLUDED.content
               THEN NULL ELSE rss_item_contents.parse_next_attempt_at END
         RETURNING id, pub_date AS "pubDate",
                   parsed_content AS "parsedContent",
                   parse_attempts AS "parseAttempts",
                   parse_next_attempt_at AS "parseNextAttemptAt"`,
      [url, guid, content, title, pubDate],
    );
    return rows[0];
  }

  private serializeItem(item: ParsedFeedItem): {
    guid: string;
    content: string;
    title: string;
    pubDate: Date | null;
    summary: string;
    articleUrl: string;
    articleContent: string;
  } {
    const contentBody =
      item.content ?? (item['content:encoded'] as string | undefined) ?? '';
    // Only the full <content:encoded> body counts as embedded content; a bare
    // <description> (which rss-parser maps to item.content) still fetches the
    // link. Guard the type: a non-CDATA feed can yield a parsed object here.
    const encoded = item['content:encoded'];
    const articleContent = typeof encoded === 'string' ? encoded.trim() : '';
    const title = item.title ?? '';
    // rss-parser normalizes pubDate to `isoDate`; fall back to the raw pubDate.
    // When neither is a parseable date, default to the current time.
    const pubDate =
      this.parsePubDate(item.isoDate ?? item.pubDate ?? null) ?? new Date();
    const content = JSON.stringify({
      title: item.title ?? null,
      link: item.link ?? null,
      content: contentBody || null,
      contentSnippet: item.contentSnippet ?? null,
      pubDate: item.pubDate ?? null,
      guid: item.guid ?? null,
    });
    // Prefer the item's own guid; fall back to a content hash when absent.
    const guid =
      item.guid?.trim() ||
      createHash('sha256')
        .update(`${item.link ?? ''}\n${contentBody}`)
        .digest('hex');
    return {
      guid,
      content,
      title,
      pubDate,
      // Seed body for a new item resource until the wizard's markdown lands.
      summary: item.contentSnippet?.trim() || contentBody || '',
      articleUrl: item.link?.trim() ?? '',
      articleContent,
    };
  }

  // Parses an RFC-822 / ISO feed date into a Date, or null when absent or
  // unparseable.
  private parsePubDate(raw: string | null): Date | null {
    if (!raw) {
      return null;
    }
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private async finishPoll(
    pollId: string,
    status: RssPollStatus,
    fields: { contentIds?: string[]; error?: string },
  ): Promise<void> {
    await this.rssPollRepository.update(pollId, {
      status,
      contentIds: fields.contentIds ?? [],
      error: fields.error ?? null,
    });
  }
}
