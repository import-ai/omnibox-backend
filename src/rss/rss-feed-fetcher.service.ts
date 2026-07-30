import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fetchWithRetry } from 'omniboxd/utils/fetch-with-retry';
import * as Parser from 'rss-parser';
import { ProxyAgent } from 'undici';

const FETCH_TIMEOUT_MS = 10_000;
const MAX_FEED_SIZE_BYTES = 5 * 1024 * 1024;

export type ParsedFeed = Parser.Output<{ [key: string]: unknown }>;
export type ParsedFeedItem = ParsedFeed['items'][number];

@Injectable()
export class RssFeedFetcherService {
  // Forward-proxy used for outbound RSS fetches. RSS URLs are arbitrary and
  // user-provided, so they cannot go through the fixed-route api-proxy-server;
  // instead route them through the shared OB_GLOBAL_PROXY egress proxy. Left
  // undefined (direct fetch) when OB_GLOBAL_PROXY is not configured.
  private readonly proxyAgent?: ProxyAgent;

  constructor(configService: ConfigService) {
    const proxyUrl = configService.get<string>('OB_GLOBAL_PROXY', '');
    if (proxyUrl) {
      this.proxyAgent = new ProxyAgent(proxyUrl);
    }
  }

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
          // `dispatcher` is honored by Node's undici-based fetch at runtime but
          // is absent from the DOM RequestInit type, hence the cast.
          ...(this.proxyAgent ? { dispatcher: this.proxyAgent } : {}),
        } as RequestInit,
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

    const body = await this.readCappedText(response);
    if (body === null) {
      return null;
    }

    try {
      return await new Parser().parseString(body);
    } catch {
      return null;
    }
  }

  // Reads the response body as UTF-8 text, aborting once more than
  // MAX_FEED_SIZE_BYTES have been read. The content-length header is easily
  // omitted (chunked responses), so this streaming cap — not the header check —
  // is what actually bounds memory. Returns null when the cap is exceeded or the
  // body can't be read.
  private async readCappedText(response: Response): Promise<string | null> {
    const stream = response.body;
    if (!stream) {
      // No readable stream (unusual for a fetch response); fall back to
      // buffering, still guarded by the post-read length check.
      try {
        const text = await response.text();
        return text.length > MAX_FEED_SIZE_BYTES ? null : text;
      } catch {
        return null;
      }
    }

    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        if (!value) {
          continue;
        }
        total += value.byteLength;
        if (total > MAX_FEED_SIZE_BYTES) {
          await reader.cancel();
          return null;
        }
        chunks.push(value);
      }
    } catch {
      return null;
    }

    return Buffer.concat(chunks).toString('utf-8');
  }
}
