import { Injectable } from '@nestjs/common';
import { fetchWithRetry } from 'omniboxd/utils/fetch-with-retry';
import * as Parser from 'rss-parser';

const FETCH_TIMEOUT_MS = 10_000;
const MAX_FEED_SIZE_BYTES = 5 * 1024 * 1024;

export type ParsedFeed = Parser.Output<{ [key: string]: unknown }>;
export type ParsedFeedItem = ParsedFeed['items'][number];

@Injectable()
export class RssFeedFetcherService {
  // Fetches and parses a feed. Returns the parsed feed, or null on any
  // network/HTTP/size/parse failure.
  async fetchAndParse(url: string): Promise<ParsedFeed | null> {
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
      return await new Parser().parseString(body);
    } catch {
      return null;
    }
  }
}
