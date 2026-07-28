import { RssItem } from 'omniboxd/rss/entities/rss-item.entity';
import { RssItemContent } from 'omniboxd/rss/entities/rss-item-content.entity';
import { RssLink } from 'omniboxd/rss/entities/rss-link.entity';
import { RssPoll } from 'omniboxd/rss/entities/rss-poll.entity';
import { RssPollingService } from 'omniboxd/rss/rss-polling.service';
import { WizardAPIService } from 'omniboxd/wizard-api/wizard-api.service';
import { TestClient } from 'test/test-client';
import { DataSource } from 'typeorm';

const FEED_URL = 'https://example.com/poll-feed';

interface FeedItem {
  title: string;
  link: string;
  guid: string;
  description: string;
  // RFC-822 publish date; omitted when the feed provides no date.
  pubDate?: string;
  // Full embedded HTML; when present the poller converts it directly instead
  // of fetching the link.
  contentEncoded?: string;
}

// Mutable so individual tests can change what the feed returns.
let feedItems: FeedItem[] = [];

function buildRss(items: FeedItem[]): string {
  const itemsXml = items
    .map(
      (item) => `
      <item>
        <title>${item.title}</title>
        <link>${item.link}</link>
        <guid>${item.guid}</guid>
        <description>${item.description}</description>${
          item.pubDate === undefined
            ? ''
            : `\n        <pubDate>${item.pubDate}</pubDate>`
        }${
          item.contentEncoded === undefined
            ? ''
            : `\n        <content:encoded><![CDATA[${item.contentEncoded}]]></content:encoded>`
        }
      </item>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Example RSS Feed</title>
    <link>https://example.com</link>
    <description>Example</description>${itemsXml}
  </channel>
</rss>`;
}

global.fetch = jest.fn().mockImplementation(() => {
  return Promise.resolve({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(buildRss(feedItems)),
  });
}) as jest.MockedFunction<typeof fetch>;

describe('RssPolling (e2e)', () => {
  let client: TestClient;
  let pollingService: RssPollingService;
  let dataSource: DataSource;
  let folderResourceId: string;
  // Stub the synchronous wizard parse call; echo the article url (or a marker
  // when only content is sent) back as markdown so tests can assert what was
  // parsed and how.
  let parseRssItemSpy: jest.SpyInstance;

  beforeAll(async () => {
    client = await TestClient.create();
    pollingService = client.app.get(RssPollingService);
    dataSource = client.app.get(DataSource);
    parseRssItemSpy = jest
      .spyOn(client.app.get(WizardAPIService), 'parseRssItem')
      .mockImplementation((params: { url?: string; content?: string }) =>
        Promise.resolve({ markdown: `# ${params.url || 'content'}` }),
      );

    feedItems = [
      {
        title: 'First',
        link: 'https://example.com/1',
        guid: 'guid-1',
        description: 'first body',
      },
      {
        title: 'Second',
        link: 'https://example.com/2',
        guid: 'guid-2',
        description: 'second body',
      },
    ];

    const created = await client
      .post(`/api/v1/namespaces/${client.namespace.id}/rss-folders`)
      .send({
        name: 'Poller',
        parent_id: client.namespace.root_resource_id,
        links: [{ url: FEED_URL }],
      })
      .expect(201);
    folderResourceId = created.body.resource.id;
  });

  afterAll(async () => {
    await client.close();
  });

  const pollRepo = () => dataSource.getRepository(RssPoll);
  const contentRepo = () => dataSource.getRepository(RssItemContent);
  const itemRepo = () => dataSource.getRepository(RssItem);
  const linkRepo = () => dataSource.getRepository(RssLink);

  it('polls a due link and stores its items', async () => {
    parseRssItemSpy.mockClear();
    // Drive pollUrl directly rather than pollDueLinks(): the latter scans
    // rss_links globally (it is the system-wide polling cron), so in the
    // shared e2e container it would also poll feed urls left behind by other
    // spec files. Per-url polling keeps this spec's assertions deterministic.
    const result = await pollingService.pollUrl(FEED_URL);
    expect(result).toBe('succeed');

    const polls = await pollRepo().find({ where: { url: FEED_URL } });
    expect(polls).toHaveLength(1);
    expect(polls[0].status).toBe('succeed');
    expect(polls[0].contentIds).toHaveLength(2);

    const contents = await contentRepo().find({ where: { url: FEED_URL } });
    expect(contents).toHaveLength(2);
    // Stored content is the serialized item.
    const parsed = JSON.parse(contents[0].content);
    expect(parsed).toMatchObject({
      title: expect.any(String),
      guid: expect.any(String),
    });

    // Each content is related to the single link, with the item title.
    const [link] = await linkRepo().find({ where: { url: FEED_URL } });
    const items = await itemRepo().find({ where: { linkId: link.id } });
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.title).sort()).toEqual(['First', 'Second']);

    // These items carry only a <description> (no <content:encoded>), so each is
    // parsed by fetching its article url, and the markdown is stored.
    expect(
      parseRssItemSpy.mock.calls.map((call) => call[0].url).sort(),
    ).toEqual(['https://example.com/1', 'https://example.com/2']);
    expect(contents.map((content) => content.parsedContent).sort()).toEqual([
      '# https://example.com/1',
      '# https://example.com/2',
    ]);
  });

  it('skips a link already polled within the window', async () => {
    parseRssItemSpy.mockClear();
    const result = await pollingService.pollUrl(FEED_URL);
    expect(result).toBe('skipped');

    expect(await pollRepo().count({ where: { url: FEED_URL } })).toBe(1);
    expect(await contentRepo().count({ where: { url: FEED_URL } })).toBe(2);
    // A skipped poll parses nothing.
    expect(parseRssItemSpy).not.toHaveBeenCalled();
  });

  it('deduplicates unchanged items and stores only new ones on re-poll', async () => {
    parseRssItemSpy.mockClear();
    // Bypass the 5-minute window by clearing the previous poll marker.
    await pollRepo().delete({ url: FEED_URL });

    feedItems = [
      ...feedItems,
      {
        title: 'Third',
        link: 'https://example.com/3',
        guid: 'guid-3',
        description: 'third body',
      },
    ];

    const result = await pollingService.pollUrl(FEED_URL);
    expect(result).toBe('succeed');

    const polls = await pollRepo().find({ where: { url: FEED_URL } });
    expect(polls).toHaveLength(1);
    expect(polls[0].contentIds).toHaveLength(3);

    // Two originals deduped, one new row added.
    expect(await contentRepo().count({ where: { url: FEED_URL } })).toBe(3);
    // Only the newly-inserted item is parsed; deduped items are left untouched.
    expect(parseRssItemSpy.mock.calls.map((call) => call[0].url)).toEqual([
      'https://example.com/3',
    ]);

    // The link is now related to all three contents; the two existing
    // relations are untouched and only the new one is added.
    const [link] = await linkRepo().find({ where: { url: FEED_URL } });
    const items = await itemRepo().find({ where: { linkId: link.id } });
    expect(items).toHaveLength(3);
    expect(items.map((item) => item.title).sort()).toEqual([
      'First',
      'Second',
      'Third',
    ]);
  });

  it('lists the items of an rss folder via the api', async () => {
    const response = await client
      .get(
        `/api/v1/namespaces/${client.namespace.id}/rss-folders/${folderResourceId}/items`,
      )
      .expect(200);

    const items = response.body as Array<Record<string, unknown>>;
    expect(items).toHaveLength(3);
    expect(items.map((item) => item.title).sort()).toEqual([
      'First',
      'Second',
      'Third',
    ]);
    // Each item exposes the article url parsed from the stored content.
    const first = items.find((item) => item.title === 'First');
    expect(first).toMatchObject({
      id: expect.any(String),
      link_id: expect.any(String),
      url: 'https://example.com/1',
      created_at: expect.any(String),
    });
  });

  it('caps the listed items with the limit query param', async () => {
    const response = await client
      .get(
        `/api/v1/namespaces/${client.namespace.id}/rss-folders/${folderResourceId}/items?limit=2`,
      )
      .expect(200);

    expect(response.body).toHaveLength(2);
  });

  it('gets parsed content for an item through the detail api', async () => {
    const [item] = await itemRepo().find();
    await contentRepo().update(item.contentId, {
      parsedContent: '# Parsed article',
    });

    const response = await client
      .get(
        `/api/v1/namespaces/${client.namespace.id}/rss-folders/${folderResourceId}/items/${item.id}`,
      )
      .expect(200);

    expect(response.body).toMatchObject({
      id: item.id,
      parsed_content: '# Parsed article',
    });
  });

  it('refreshes the content of an existing guid on refetch', async () => {
    parseRssItemSpy.mockClear();
    await pollRepo().delete({ url: FEED_URL });

    const before = await contentRepo().findOneOrFail({
      where: { url: FEED_URL, guid: 'guid-1' },
    });

    // Same guid, changed body.
    feedItems = feedItems.map((item) =>
      item.guid === 'guid-1' ? { ...item, description: 'updated body' } : item,
    );

    await pollingService.pollUrl(FEED_URL);

    // No new row for the guid, but its content is refreshed.
    expect(await contentRepo().count({ where: { url: FEED_URL } })).toBe(3);
    const after = await contentRepo().findOneOrFail({
      where: { url: FEED_URL, guid: 'guid-1' },
    });
    expect(after.id).toBe(before.id);
    expect(JSON.parse(after.content).content).toBe('updated body');
    // Refreshing an existing item does not re-parse it.
    expect(parseRssItemSpy).not.toHaveBeenCalled();
  });

  it('relates a newly-added link sharing the url to existing contents', async () => {
    // A second folder points at the same feed url, adding another rss_links row.
    await client
      .post(`/api/v1/namespaces/${client.namespace.id}/rss-folders`)
      .send({
        name: 'Poller 2',
        parent_id: client.namespace.root_resource_id,
        links: [{ url: FEED_URL }],
      })
      .expect(201);

    const links = await linkRepo().find({ where: { url: FEED_URL } });
    expect(links).toHaveLength(2);

    // Bypass the window and re-poll: the poll relates every link sharing the url.
    parseRssItemSpy.mockClear();
    await pollRepo().delete({ url: FEED_URL });
    await pollingService.pollUrl(FEED_URL);

    // Contents are still deduped globally per url.
    const contentCount = await contentRepo().count({
      where: { url: FEED_URL },
    });
    expect(contentCount).toBe(3);
    // Nothing new to insert, so nothing is parsed.
    expect(parseRssItemSpy).not.toHaveBeenCalled();

    // Every link is now related to all three contents.
    for (const link of links) {
      expect(await itemRepo().count({ where: { linkId: link.id } })).toBe(3);
    }
  });

  it('discovers and polls a due link through pollDueLinks', async () => {
    // Covers the cron entrypoint's due-link discovery. It scans rss_links
    // globally, so other spec files may contribute additional urls in the
    // shared container; assert only that our due link was claimed and polled.
    await pollRepo().delete({ url: FEED_URL });

    const summary = await pollingService.pollDueLinks();
    expect(summary.claimed).toBeGreaterThanOrEqual(1);
    expect(summary.succeeded).toBeGreaterThanOrEqual(1);

    const polls = await pollRepo().find({ where: { url: FEED_URL } });
    expect(polls).toHaveLength(1);
    expect(polls[0].status).toBe('succeed');
  });

  it('converts embedded content:encoded without fetching the link', async () => {
    const embeddedHtml = '<p>Full <b>article</b> body</p>';
    feedItems = [
      ...feedItems,
      {
        title: 'Embedded',
        link: 'https://example.com/embedded',
        guid: 'guid-embedded',
        description: 'short summary',
        contentEncoded: embeddedHtml,
      },
    ];

    parseRssItemSpy.mockClear();
    await pollRepo().delete({ url: FEED_URL });
    await pollingService.pollUrl(FEED_URL);

    // The item with embedded content is parsed from that content, with its link
    // passed only as an image base — not fetched.
    expect(parseRssItemSpy).toHaveBeenCalledTimes(1);
    expect(parseRssItemSpy.mock.calls[0][0]).toEqual({
      url: 'https://example.com/embedded',
      content: embeddedHtml,
    });

    const stored = await contentRepo().findOneOrFail({
      where: { url: FEED_URL, guid: 'guid-embedded' },
    });
    expect(stored.parsedContent).toBe('# https://example.com/embedded');
  });

  it('stores pub date/title and lists items newest published first', async () => {
    // Added out of chronological order so the assertion proves the API sorts by
    // publish date, not insertion order.
    const dated: FeedItem[] = [
      {
        title: 'Middle',
        link: 'https://example.com/mid',
        guid: 'guid-mid',
        description: 'mid body',
        pubDate: 'Sun, 01 Mar 2026 00:00:00 GMT',
      },
      {
        title: 'Newest',
        link: 'https://example.com/new',
        guid: 'guid-new',
        description: 'new body',
        pubDate: 'Wed, 01 Apr 2026 00:00:00 GMT',
      },
      {
        title: 'Oldest',
        link: 'https://example.com/old',
        guid: 'guid-old',
        description: 'old body',
        pubDate: 'Fri, 20 Feb 2026 00:00:00 GMT',
      },
    ];
    feedItems = [...feedItems, ...dated];

    await pollRepo().delete({ url: FEED_URL });
    await pollingService.pollUrl(FEED_URL);

    // The content row carries the parsed title and pub date columns.
    const newest = await contentRepo().findOneOrFail({
      where: { url: FEED_URL, guid: 'guid-new' },
    });
    expect(newest.title).toBe('Newest');
    expect(newest.pubDate?.toISOString()).toBe(
      new Date('Wed, 01 Apr 2026 00:00:00 GMT').toISOString(),
    );

    const response = await client
      .get(
        `/api/v1/namespaces/${client.namespace.id}/rss-folders/${folderResourceId}/items`,
      )
      .expect(200);
    const items = response.body as Array<Record<string, unknown>>;

    // Items with a publish date sort ahead of the older undated ones (nulls
    // last), most recent first.
    expect(items.slice(0, 3).map((item) => item.title)).toEqual([
      'Newest',
      'Middle',
      'Oldest',
    ]);
    expect(items[0].published_at).toBe(
      new Date('Wed, 01 Apr 2026 00:00:00 GMT').toISOString(),
    );
  });
});
