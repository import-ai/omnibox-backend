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
import { Transaction, transaction } from 'omniboxd/utils/transaction-utils';
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

// A wizard parse that fails (restart, timeout, network blip, an article that
// will not render) leaves parsed_content null and is retried by the next polls
// with exponential backoff. Retries never give up: an unparsed item has no
// resource copy yet, so giving up would drop the article for good.
const PARSE_BACKOFF_BASE_MS = 5 * 60 * 1000; // matches the poll cadence
// Doubling stops here; every later retry waits the same maximum interval.
const PARSE_BACKOFF_MAX_EXPONENT = 6;

// The partial unique index that carries an rss item's (link_id, guid) identity
// among the live rows (see the add-rss-item-resources migration; it is
// restricted to deleted_at IS NULL). Postgres names it as the violated
// constraint, which is how a losing insert is told apart from any other unique
// violation raised while creating an item.
const RSS_ITEM_IDENTITY_INDEX = 'uq_resources_rss_item_identity';

// The columns every read of a content row needs: its id, the frozen feed
// snapshot a copy is built from, and the parse state that decides whether it
// is parsed, due for a retry, or settled.
const ITEM_CONTENT_COLUMNS = `id, pub_date AS "pubDate", title, content,
          parsed_content AS "parsedContent",
          parse_attempts AS "parseAttempts",
          parse_next_attempt_at AS "parseNextAttemptAt"`;

// Delay before the nth failed attempt is retried: 10m, 20m, 40m, ... up to
// 5h20m, then that interval forever. The exponent is clamped rather than the
// result, so an item that has been failing for months never computes an absurd
// intermediate.
function parseBackoffMs(attempts: number): number {
  return (
    PARSE_BACKOFF_BASE_MS * 2 ** Math.min(attempts, PARSE_BACKOFF_MAX_EXPONENT)
  );
}

// The feed item as it was serialized into the content row on first sight: the
// fields a copy is built from, all of them optional because the blob predates
// this shape in old rows and is not schema-checked.
interface FeedItemSnapshot {
  link?: unknown;
  content?: unknown;
  contentSnippet?: unknown;
  // The item's <content:encoded>, the only body the wizard converts without
  // fetching the link. Absent in rows stored before this field was recorded,
  // whose items are scraped from their link instead.
  contentEncoded?: unknown;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

// The stored blob is always JSON written by serializeItem, but a legacy or
// hand-written row must not fail a poll.
function parseFeedItem(raw: string | null): FeedItemSnapshot {
  if (!raw) {
    return {};
  }
  try {
    return (JSON.parse(raw) as FeedItemSnapshot) ?? {};
  } catch {
    return {};
  }
}

// Body for a copy of an item there is nothing to parse: the feed's own snippet,
// else its inline body.
function snapshotSummary(snapshot: FeedItemSnapshot): string {
  return (
    asString(snapshot.contentSnippet)?.trim() ||
    asString(snapshot.content) ||
    ''
  );
}

export interface PollSummary {
  claimed: number;
  succeeded: number;
  failed: number;
}

// A row of the shared (url, guid) fetch/parse cache, as the poller reads it.
interface ItemContentRow {
  id: string;
  pubDate: Date | null;
  // The feed's title and the serialized feed item, both frozen at first sight.
  // Null title only for rows stored before the column existed.
  title: string | null;
  content: string | null;
  parsedContent: string | null;
  parseAttempts: number;
  parseNextAttemptAt: Date | null;
}

// A stored feed item: the deduped content row id plus everything needed to
// materialize the item as a resource under each subscribing folder. Every field
// a copy is built from comes from the content row, which is frozen at first
// sight, so two folders that subscribe at different times get identical copies.
interface StoredItem {
  contentId: string;
  guid: string;
  title: string;
  pubDate: Date | null;
  // Body for the item resource, once the item has settled: the wizard's
  // markdown, or the feed's own summary for an item there is nothing to parse.
  // Null while a parse is still being retried — no copy is created until then,
  // because the poller writes a copy's body exactly once, when it inserts it.
  content: string | null;
  articleUrl: string;
}

// A stored item whose body has settled, which is the only kind that is ever
// written to a resource.
type SettledItem = StoredItem & { content: string };

function isSettled(item: StoredItem): item is SettledItem {
  return item.content !== null;
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
      // Give every folder subscribed to this url its own copy of each settled
      // item.
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
  // stored/parsed on the next poll (an unparsed item is retried via the
  // parsed_content-null path, an unseen one is inserted then). An individual
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
    const { guid, content, title, pubDate } = this.serializeItem(item);
    const stored = await this.ensureItemContent(
      url,
      guid,
      content,
      title,
      pubDate,
    );
    const { id, parsedContent, parseAttempts, parseNextAttemptAt } = stored;
    // Everything below reads the stored row, never this fetch: the row is one
    // article shared by every subscriber and frozen at first sight, so what is
    // parsed, when the item settles, and what its copies say cannot drift as
    // the feed rewrites the entry.
    const snapshot = parseFeedItem(stored.content);
    const articleUrl = asString(snapshot.link)?.trim() ?? '';
    const articleContent = asString(snapshot.contentEncoded)?.trim() ?? '';
    // Parse items that still have no parsed content: newly-inserted ones on the
    // spot, and previously-failed ones once their backoff has elapsed. An
    // already-parsed item is never parsed again, and an item with nothing to
    // parse never accumulates attempts. The poll window keeps a url's polls from
    // overlapping, so no two polls parse the same row.
    const shouldParse =
      Boolean(articleUrl || articleContent) &&
      parsedContent === null &&
      (parseNextAttemptAt === null ||
        parseNextAttemptAt.getTime() <= Date.now());
    const freshlyParsed = shouldParse
      ? await this.parseItemContent(
          id,
          parseAttempts,
          articleUrl,
          articleContent,
        )
      : null;
    // An item settles once the wizard has rendered it, or immediately when
    // there is nothing to render; until then it has no body and no copies.
    const parsed = freshlyParsed ?? parsedContent;
    const nothingToParse = !articleUrl && !articleContent;
    return {
      contentId: id,
      guid,
      title: stored.title ?? title,
      pubDate: stored.pubDate,
      content: parsed ?? (nothingToParse ? snapshotSummary(snapshot) : null),
      articleUrl,
    };
  }

  // Renders the article to Markdown via the wizard and stores it on the shared
  // content row. Returns the markdown, which is what settles the item: every
  // copy of it — the ones this poll goes on to create and the ones a later
  // subscription brings — is built from this one result. When the feed embedded
  // full content the wizard converts that directly (no link fetch); otherwise it
  // scrapes articleUrl. Best-effort: a failure leaves parsed_content null and
  // never fails the poll, but it records the attempt so a later poll retries it
  // after a backoff. `attempts` is the number of attempts that have already
  // failed for this item.
  private async parseItemContent(
    contentId: string,
    attempts: number,
    articleUrl: string,
    articleContent: string,
  ): Promise<string | null> {
    try {
      const { markdown } = await this.wizardApiService.parseRssItem(
        {
          url: articleUrl,
          content: articleContent,
        },
        AbortSignal.timeout(WIZARD_PARSE_TIMEOUT_MS),
      );
      // Empty markdown is a failed parse too: without counting it as an attempt
      // the item would be re-parsed on every poll forever.
      if (!markdown) {
        throw new Error('wizard returned empty markdown');
      }
      await this.rssItemContentRepository.update(contentId, {
        parsedContent: markdown,
        parseNextAttemptAt: null,
      });
      return markdown;
    } catch (err) {
      this.logger.error(
        `Failed to parse rss item ${contentId} (${articleUrl}): ${err instanceof Error ? err.message : String(err)}`,
      );
      await this.recordParseFailure(contentId, attempts);
      return null;
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
  // each settled item, one `rss_item` resource per (link, guid) pair. Items are
  // deliberately not deduped across folders: each folder owns its copies, in its
  // own namespace, under its own rss folder resource.
  //
  // This is the only place the poller writes an item resource, and it only ever
  // inserts: a pair that already has a LIVE copy is left exactly as it was
  // created, however the feed has since rewritten the item's body or title. A
  // retired copy is ignored instead, so a folder that re-subscribes to a url
  // gets the article back as a fresh resource next to the soft-deleted history.
  // Nothing user-facing can retire an individual item — items go only with their
  // link or their folder — so a retired copy is only ever reachable again
  // through a re-subscription.
  //
  // Polls of one url do not normally overlap: claim() leaves a POLLING marker
  // that makes every later claim skip the url. That is a lock with a timeout,
  // though — after POLL_STALE_MS a second worker may take over a poll that is
  // merely slow rather than dead — so the read-then-insert below can still race.
  // The (link_id, guid) unique index is what actually guarantees a single copy;
  // a losing insert is dropped instead of failing the poll.
  //
  // The three reads below are equally unsynchronised with the folder's own
  // writes: a subscription can be dropped between them and the insert, so every
  // create re-checks it inside its transaction (see subscriptionIsLive).
  private async linkItems(url: string, stored: StoredItem[]): Promise<void> {
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
    const existing = new Set<string>();
    if (items.length > 0) {
      const rows = await this.resourceRepository
        .createQueryBuilder('resource')
        .select("resource.attrs->>'link_id'", 'linkId')
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
        .getRawMany<{ linkId: string; guid: string }>();
      for (const row of rows) {
        existing.add(`${row.linkId}:${row.guid}`);
      }
    }

    for (const link of links) {
      const folder = folderById.get(link.resourceId);
      if (!folder || !folder.userId) {
        continue;
      }
      for (const item of items) {
        // An unsettled item has no body to write yet: its parse is still being
        // retried, and a copy created now could never be corrected. It is
        // created by the poll that finally parses it.
        if (!isSettled(item) || existing.has(`${link.id}:${item.guid}`)) {
          continue;
        }
        await this.createItemResource(link, folder, item);
      }
      await this.rssLinkRepository
        .createQueryBuilder()
        .update(RssLink)
        .set({
          initialSyncedAt: () => 'COALESCE(initial_synced_at, NOW())',
        })
        .where('id = :id', { id: link.id })
        .andWhere('deleted_at IS NULL')
        .execute();
    }
  }

  private async createItemResource(
    link: RssLink,
    folder: Resource,
    item: SettledItem,
  ): Promise<void> {
    try {
      await this.insertItemResource(link, folder, item);
    } catch (err) {
      // An overlapping poll may have inserted this copy in between the
      // existence check and here; the identity index rejects the second insert
      // (it covers exactly the live rows that check looked at), which is the
      // outcome we want. Anything else — including a unique violation raised by
      // one of the other rows an item insert writes (its resource id, its index
      // task) — is a real failure and fails the poll.
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
  // the 23505 code alone: an item insert also writes other rows (its resource
  // id, its index task) whose own unique constraints must never be swallowed
  // here.
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

  // Re-checks, inside the insert's own transaction, that the subscription this
  // copy would hang off is still there. linkItems reads the links, the folders
  // and the existing copies outside any transaction, so a `PATCH .../config`
  // that drops the url can commit in between: it trashes the link's items and
  // retires the link, and an insert that went ahead regardless would leave a
  // live item hanging off a retired link. Nothing ever clears that up — the
  // removal has already run and no later poll revisits a soft-deleted link — so
  // the folder would list the article forever, with no link name behind it.
  //
  // The link row is locked FOR SHARE so the answer holds for the rest of the
  // transaction: removeLink takes FOR UPDATE on the same row before it collects
  // the items to trash, so only two interleavings remain — either the removal
  // committed first and this poll skips the item, or the removal waits for this
  // insert and then trashes the copy it just made.
  //
  // The folder resource is checked but not locked. Trashing a folder leaves its
  // items live underneath it (they come back when it is restored), so an item
  // inserted just as the folder is trashed is in exactly the state every other
  // item of that folder is in — only a folder that is already gone by the time
  // this runs has nowhere to hang the item. Locking it would also invert this
  // transaction's lock order: the insert below already takes FOR KEY SHARE on
  // the folder row through the resources.parent_id self-FK, i.e. after this
  // link lock, and every writer of a feed folder has to acquire in that same
  // order — link row, then folder row — or deadlock (RssFoldersService.update
  // reconciles links before it renames for exactly this reason).
  private async subscriptionIsLive(
    tx: Transaction,
    link: RssLink,
    folder: Resource,
  ): Promise<boolean> {
    const manager = tx.entityManager;
    const liveLink: unknown[] = await manager.query(
      `SELECT 1 FROM rss_links WHERE id = $1 AND deleted_at IS NULL FOR SHARE`,
      [link.id],
    );
    if (liveLink.length === 0) {
      return false;
    }
    const liveFolder: unknown[] = await manager.query(
      `SELECT 1 FROM resources WHERE id = $1 AND deleted_at IS NULL`,
      [folder.id],
    );
    return liveFolder.length > 0;
  }

  private async insertItemResource(
    link: RssLink,
    folder: Resource,
    item: SettledItem,
  ): Promise<void> {
    await transaction(this.dataSource.manager, async (tx) => {
      if (!(await this.subscriptionIsLive(tx, link, folder))) {
        this.logger.warn(
          `Skipped rss item ${item.guid} for link ${link.id}: its subscription went away mid-poll`,
        );
        return;
      }
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

  // The one (url, guid) row every subscriber of an article shares, written on
  // first sight and never rewritten: a feed that revises an item's body or title
  // is ignored, so the snapshot a copy is built from — and the parse cached
  // against it — cannot change under the copies already created from it. Returns
  // that row, whether this poll inserted it or found it.
  private async ensureItemContent(
    url: string,
    guid: string,
    content: string,
    title: string,
    pubDate: Date | null,
  ): Promise<ItemContentRow> {
    const inserted: ItemContentRow[] =
      await this.rssItemContentRepository.query(
        `INSERT INTO rss_item_contents (url, guid, content, title, pub_date)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (url, guid) DO NOTHING
         RETURNING ${ITEM_CONTENT_COLUMNS}`,
        [url, guid, content, title, pubDate],
      );
    if (inserted.length > 0) {
      return inserted[0];
    }
    // DO NOTHING returns no row, so the losing insert reads the row it lost to.
    // Deliberately unfiltered by deleted_at: this must see exactly the row the
    // unique index conflicted on.
    const existing: ItemContentRow[] =
      await this.rssItemContentRepository.query(
        `SELECT ${ITEM_CONTENT_COLUMNS}
         FROM rss_item_contents WHERE url = $1 AND guid = $2`,
        [url, guid],
      );
    return existing[0];
  }

  private serializeItem(item: ParsedFeedItem): {
    guid: string;
    content: string;
    title: string;
    pubDate: Date | null;
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
      contentEncoded: articleContent || null,
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
    return { guid, content, title, pubDate };
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
