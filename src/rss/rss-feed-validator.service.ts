import { HttpStatus, Injectable } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { RssFeedFetcherService } from 'omniboxd/rss/rss-feed-fetcher.service';

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
  constructor(
    private readonly i18n: I18nService,
    private readonly feedFetcher: RssFeedFetcherService,
  ) {}

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
    const feed = await this.feedFetcher.fetchAndParse(url);
    if (feed === null) {
      return null;
    }
    return feed.title?.trim() || '';
  }
}
