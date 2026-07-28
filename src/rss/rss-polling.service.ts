import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { RssItemContent } from 'omniboxd/rss/entities/rss-item-content.entity';
import { RssLink } from 'omniboxd/rss/entities/rss-link.entity';
import { RssPoll, RssPollStatus } from 'omniboxd/rss/entities/rss-poll.entity';
import {
  ParsedFeedItem,
  RssFeedFetcherService,
} from 'omniboxd/rss/rss-feed-fetcher.service';
import { transaction } from 'omniboxd/utils/transaction-utils';
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
    private readonly dataSource: DataSource,
    private readonly feedFetcher: RssFeedFetcherService,
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

      const contentIds = await this.storeItems(url, feed.items ?? []);
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
  ): Promise<string[]> {
    const contentIds: string[] = [];
    for (const item of items) {
      const { guid, content } = this.serializeItem(item);
      contentIds.push(await this.upsertItemContent(url, guid, content));
    }
    return contentIds;
  }

  // Deduplicates per (url, guid); refreshes the content of an existing row on
  // refetch. Returns the id of the existing or new row.
  private async upsertItemContent(
    url: string,
    guid: string,
    content: string,
  ): Promise<string> {
    const result = await this.rssItemContentRepository
      .createQueryBuilder()
      .insert()
      .into(RssItemContent)
      .values({ url, guid, content })
      .orUpdate(['content', 'updated_at'], ['url', 'guid'])
      .returning('id')
      .execute();

    // ON CONFLICT DO UPDATE always returns the row (inserted or updated).
    return result.raw[0].id as string;
  }

  private serializeItem(item: ParsedFeedItem): {
    guid: string;
    content: string;
  } {
    const contentBody =
      item.content ?? (item['content:encoded'] as string | undefined) ?? '';
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
    return { guid, content };
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
