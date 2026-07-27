import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';

import { RssFeedValidatorService } from './rss-feed-validator.service';

const RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Example RSS Feed</title>
    <link>https://example.com</link>
    <description>Example</description>
    <item><title>First</title><link>https://example.com/1</link></item>
  </channel>
</rss>`;

const ATOM_XML = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Atom Feed</title>
  <id>urn:example</id>
  <updated>2026-01-01T00:00:00Z</updated>
</feed>`;

const HTML_BODY = '<!doctype html><html><body>not a feed</body></html>';

function mockResponse(body: string, ok = true): Response {
  return {
    ok,
    headers: new Headers(),
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('RssFeedValidatorService', () => {
  const i18n = {
    t: jest.fn().mockReturnValue('invalid feed'),
  } as unknown as I18nService;
  const service = new RssFeedValidatorService(i18n);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('accepts an RSS 2.0 feed and extracts the title', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(mockResponse(RSS_XML));

    const result = await service.validateAll([
      { url: 'https://example.com/feed' },
    ]);
    expect(result).toEqual([
      { url: 'https://example.com/feed', name: 'Example RSS Feed' },
    ]);
  });

  it('accepts an Atom feed', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(mockResponse(ATOM_XML));

    const result = await service.validateAll([
      { url: 'https://example.com/atom' },
    ]);
    expect(result[0].name).toBe('Example Atom Feed');
  });

  it('prefers the user-provided name over the feed title', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(mockResponse(RSS_XML));

    const result = await service.validateAll([
      { url: 'https://example.com/feed', name: 'My Feed' },
    ]);
    expect(result[0].name).toBe('My Feed');
  });

  it('rejects an HTML page', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(mockResponse(HTML_BODY));

    await expect(
      service.validateAll([{ url: 'https://example.com' }]),
    ).rejects.toMatchObject({
      code: 'RSS_FEED_INVALID',
      data: { failed: [{ index: 0, url: 'https://example.com' }] },
    });
  });

  it('rejects a non-2xx response', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(mockResponse('not found', false));

    await expect(
      service.validateAll([{ url: 'https://example.com/404' }]),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('rejects when the fetch keeps failing', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('boom'));

    await expect(
      service.validateAll([{ url: 'https://example.com/dead' }]),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('reports only the failing indices of a mixed batch', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockImplementation((url) =>
        Promise.resolve(
          (url as string).includes('bad')
            ? mockResponse(HTML_BODY)
            : mockResponse(RSS_XML),
        ),
      );

    await expect(
      service.validateAll([
        { url: 'https://example.com/good' },
        { url: 'https://example.com/bad' },
        { url: 'https://example.com/good2' },
      ]),
    ).rejects.toMatchObject({
      data: { failed: [{ index: 1, url: 'https://example.com/bad' }] },
    });
  });

  it('falls back to the hostname when the feed has no title', async () => {
    const untitled = ATOM_XML.replace('<title>Example Atom Feed</title>', '');
    jest.spyOn(global, 'fetch').mockResolvedValue(mockResponse(untitled));

    const result = await service.validateAll([
      { url: 'https://feeds.example.com/x' },
    ]);
    expect(result[0].name).toBe('feeds.example.com');
  });
});
