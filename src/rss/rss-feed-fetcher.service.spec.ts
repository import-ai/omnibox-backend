import { ConfigService } from '@nestjs/config';
import { RssFeedFetcherService } from 'omniboxd/rss/rss-feed-fetcher.service';

const RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Example RSS Feed</title>
    <link>https://example.com</link>
    <description>Example</description>
  </channel>
</rss>`;

// A minimal stand-in for the fields fetchAndParse reads off a fetch Response.
// Using a plain object (rather than a real undici Response) keeps `body` as the
// exact ReadableStream under test, so cancellation and pull counts are
// observable without undici's internal stream wrapping.
function mockResponse(body: ReadableStream<Uint8Array>): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    body,
    text: () => Promise.resolve(''),
  } as unknown as Response;
}

function makeService(): RssFeedFetcherService {
  const config = { get: () => '' } as unknown as ConfigService;
  return new RssFeedFetcherService(config);
}

describe('RssFeedFetcherService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('streams and parses a feed body', async () => {
    const body = new TextEncoder().encode(RSS_XML);
    let i = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (i === 0) {
          controller.enqueue(body);
          i += 1;
        } else {
          controller.close();
        }
      },
    });
    global.fetch = jest.fn().mockResolvedValue(mockResponse(stream));

    const feed = await makeService().fetchAndParse('https://example.com/feed');

    expect(feed?.title).toBe('Example RSS Feed');
  });

  it('stops reading and cancels once the streamed body exceeds the size cap', async () => {
    // Ten 1 MiB chunks (10 MiB) far exceeds the 5 MiB cap. If the cap is
    // enforced the reader bails after crossing it — pulling far fewer than all
    // ten chunks and cancelling the stream — instead of buffering the lot.
    const oneMib = new Uint8Array(1024 * 1024);
    const totalChunks = 10;
    let pulled = 0;
    const cancel = jest.fn();
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (pulled < totalChunks) {
          pulled += 1;
          controller.enqueue(oneMib);
        } else {
          controller.close();
        }
      },
      cancel() {
        cancel();
      },
    });
    global.fetch = jest.fn().mockResolvedValue(mockResponse(stream));

    const feed = await makeService().fetchAndParse('https://example.com/big');

    expect(feed).toBeNull();
    expect(pulled).toBeLessThan(totalChunks);
    expect(cancel).toHaveBeenCalled();
  });
});
