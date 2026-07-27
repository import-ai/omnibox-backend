import { HttpStatus, Injectable } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { fetchWithRetry } from 'omniboxd/utils/fetch-with-retry';
import * as Parser from 'rss-parser';

const FETCH_TIMEOUT_MS = 10_000;
const MAX_FEED_SIZE_BYTES = 5 * 1024 * 1024;

export interface RssLinkInput {
  url: string;
  name?: string;
}

export interface ValidatedRssLink {
  url: string;
  name: string;
}

@Injectable()
export class RssFeedValidatorService {
  constructor(private readonly i18n: I18nService) {}

  async validateAll(links: RssLinkInput[]): Promise<ValidatedRssLink[]> {
    const results = await Promise.all(
      links.map((link) => this.validateOne(link)),
    );

    const failed = results
      .map((result, index) => ({ result, index }))
      .filter(({ result }) => result === null)
      .map(({ index }) => ({ index, url: links[index].url }));
    if (failed.length > 0) {
      const message = this.i18n.t('rssFolder.errors.invalidFeed');
      throw new AppException(
        message,
        'RSS_FEED_INVALID',
        HttpStatus.UNPROCESSABLE_ENTITY,
        { failed },
      );
    }

    return results as ValidatedRssLink[];
  }

  private async validateOne(
    link: RssLinkInput,
  ): Promise<ValidatedRssLink | null> {
    const feedTitle = await this.fetchFeedTitle(link.url);
    if (feedTitle === null) {
      return null;
    }
    return {
      url: link.url,
      name: link.name?.trim() || feedTitle || new URL(link.url).hostname,
    };
  }

  // Returns the feed title ('' if absent) for a valid feed, null otherwise.
  private async fetchFeedTitle(url: string): Promise<string | null> {
    let response: Response;
    try {
      response = await fetchWithRetry(
        url,
        {
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          redirect: 'follow',
          headers: {
            accept:
              'application/rss+xml, application/atom+xml, ' +
              'application/xml;q=0.9, text/xml;q=0.9, */*;q=0.8',
          },
        },
        1,
      );
    } catch {
      return null;
    }

    if (!response.ok) {
      return null;
    }

    const contentLength = Number(response.headers.get('content-length'));
    if (contentLength > MAX_FEED_SIZE_BYTES) {
      return null;
    }

    let body: string;
    try {
      body = await response.text();
    } catch {
      return null;
    }
    if (body.length > MAX_FEED_SIZE_BYTES) {
      return null;
    }

    try {
      const feed = await new Parser().parseString(body);
      return feed.title?.trim() || '';
    } catch {
      return null;
    }
  }
}
