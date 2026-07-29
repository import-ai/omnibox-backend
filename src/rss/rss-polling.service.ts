import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { RssItem } from 'omniboxd/rss/entities/rss-item.entity';
import { RssItemContent } from 'omniboxd/rss/entities/rss-item-content.entity';
import { RssLink } from 'omniboxd/rss/entities/rss-link.entity';
import { RssPoll, RssPollStatus } from 'omniboxd/rss/entities/rss-poll.entity';
import {
  ParsedFeedItem,
  RssFeedFetcherService,
} from 'omniboxd/rss/rss-feed-fetcher.service';
import { transaction } from 'omniboxd/utils/transaction-utils';
import { WizardAPIService } from 'omniboxd/wizard-api/wizard-api.service';
import { DataSource, Repository } from 'typeorm';

// Each URL is polled at most once within this window; a freshly-inserted
// `polling` row blocks re-polling even before it finishes.
const POLL_WINDOW = "interval '5 minutes'";
const POLL_CONCURRENCY = 5;

export interface PollSummary {
  claimed: number;
  succeeded: number;
  failed: number;
}

// A stored feed item: the deduped content row id plus its title and publish
// date (denormalized onto rss_items when linking).
interface StoredItem {
  contentId: string;
  title: string;
  pubDate: Date | null;
}

@Injectable()
export class RssPollingService {
  private readonly logger = new Logger(RssPollingService.name);

  constructor(
    @InjectRepository(RssLink)
    private readonly rssLinkRepository: Repository<RssLink>,
    @InjectRepository(RssPoll)
    private readonly rssPollRepository: Repository<RssPoll>,
    @InjectRepository(RssItemContent)
    private readonly rssItemContentRepository: Repository<RssItemContent>,
    @InjectRepository(RssItem)
    private readonly rssItemRepository: Repository<RssItem>,
    private readonly dataSource: DataSource,
    private readonly feedFetcher: RssFeedFetcherService,
    private readonly wizardApiService: WizardAPIService,
  ) {}

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
  // URL within the window, otherwise the resulting poll status.
  async pollUrl(url: string): Promise<'skipped' | 'succeed' | 'failed'> {
    let poll: RssPoll | null = null;
    try {
      poll = await this.claim(url);
      if (poll === null) {
        return 'skipped';
      }

      // Network I/O stays outside any transaction.
      const feed = await this.feedFetcher.fetchAndParse(url);
      if (feed === null) {
        await this.finishPoll(poll.id, RssPollStatus.FAILED, {
          error: 'fetch/parse failed',
        });
        return 'failed';
      }

      const stored = await this.storeItems(url, feed.items ?? []);
      // Relate every link sharing this url to the polled contents.
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

  // Race-safe claim across instances: serialize on the URL via an advisory
  // lock, then insert a `polling` marker only if none exists within the window.
  private async claim(url: string): Promise<RssPoll | null> {
    return await transaction(this.dataSource.manager, async (tx) => {
      const manager = tx.entityManager;
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`rss-poll:${url}`],
      );

      const recent = await manager.query(
        `SELECT 1 FROM rss_polls
         WHERE url = $1 AND created_at > now() - ${POLL_WINDOW}
         LIMIT 1`,
        [url],
      );
      if (recent.length > 0) {
        return null;
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

  private async storeItems(
    url: string,
    items: ParsedFeedItem[],
  ): Promise<StoredItem[]> {
    const stored: StoredItem[] = [];
    for (const item of items) {
      const { guid, content, title, pubDate, articleUrl, articleContent } =
        this.serializeItem(item);
      const { id, inserted } = await this.upsertItemContent(
        url,
        guid,
        content,
        title,
        pubDate,
      );
      // Only newly-inserted items are parsed; refreshed items keep their
      // existing parsed content.
      if (inserted && (articleUrl || articleContent)) {
        await this.parseItemContent(id, articleUrl, articleContent);
      }
      stored.push({ contentId: id, title, pubDate });
    }
    return stored;
  }

  // Renders the article to Markdown via the wizard and stores it. When the feed
  // embedded full content the wizard converts that directly (no link fetch);
  // otherwise it scrapes articleUrl. Best-effort: a failure leaves
  // parsed_content null and never fails the poll.
  private async parseItemContent(
    contentId: string,
    articleUrl: string,
    articleContent: string,
  ): Promise<void> {
    try {
      const { markdown } = await this.wizardApiService.parseRssItem({
        url: articleUrl,
        content: articleContent,
      });
      if (markdown) {
        await this.rssItemContentRepository.update(contentId, {
          parsedContent: markdown,
        });
      }
    } catch (err) {
      this.logger.error(
        `Failed to parse rss item ${contentId} (${articleUrl}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Relates every rss_links row sharing the polled url to the stored contents,
  // one rss_items row per (link, content) pair. Idempotent: the unique
  // (link_id, content_id) index + ON CONFLICT DO NOTHING means only pairs not
  // yet related get inserted, so re-polls add only newly-appeared items.
  private async linkItems(url: string, stored: StoredItem[]): Promise<void> {
    if (stored.length === 0) {
      return;
    }
    const links = await this.rssLinkRepository.find({ where: { url } });
    if (links.length === 0) {
      return;
    }

    const rows = links.flatMap((link) =>
      stored.map((item) => ({
        linkId: link.id,
        contentId: item.contentId,
        title: item.title,
        pubDate: item.pubDate,
      })),
    );

    await this.rssItemRepository
      .createQueryBuilder()
      .insert()
      .into(RssItem)
      .values(rows)
      .orIgnore()
      .execute();
  }

  // Deduplicates per (url, guid); refreshes the content of an existing row on
  // refetch. Returns the id of the existing or new row.
  private async upsertItemContent(
    url: string,
    guid: string,
    content: string,
    title: string,
    pubDate: Date | null,
  ): Promise<{ id: string; inserted: boolean }> {
    const rows: Array<{ id: string; inserted: boolean }> =
      await this.rssItemContentRepository.query(
        `INSERT INTO rss_item_contents (url, guid, content, title, pub_date)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (url, guid) DO UPDATE
         SET content = EXCLUDED.content,
             title = EXCLUDED.title,
             pub_date = EXCLUDED.pub_date,
             updated_at = now()
         RETURNING id, (xmax = 0) AS inserted`,
        [url, guid, content, title, pubDate],
      );
    return rows[0];
  }

  private serializeItem(item: ParsedFeedItem): {
    guid: string;
    content: string;
    title: string;
    pubDate: Date | null;
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
