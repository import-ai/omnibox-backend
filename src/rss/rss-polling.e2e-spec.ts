import { RssItemContent } from 'omniboxd/rss/entities/rss-item-content.entity';
import { RssPoll } from 'omniboxd/rss/entities/rss-poll.entity';
import { RssPollingService } from 'omniboxd/rss/rss-polling.service';
import { TestClient } from 'test/test-client';
import { DataSource } from 'typeorm';

const FEED_URL = 'https://example.com/poll-feed';

interface FeedItem {
  title: string;
  link: string;
  guid: string;
  description: string;
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
        <description>${item.description}</description>
      </item>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
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

  beforeAll(async () => {
    client = await TestClient.create();
    pollingService = client.app.get(RssPollingService);
    dataSource = client.app.get(DataSource);

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

    await client
      .post(`/api/v1/namespaces/${client.namespace.id}/rss-folders`)
      .send({
        name: 'Poller',
        parent_id: client.namespace.root_resource_id,
        links: [{ url: FEED_URL }],
      })
      .expect(201);
  });

  afterAll(async () => {
    await client.close();
  });

  const pollRepo = () => dataSource.getRepository(RssPoll);
  const contentRepo = () => dataSource.getRepository(RssItemContent);

  it('polls a due link and stores its items', async () => {
    const summary = await pollingService.pollDueLinks();
    expect(summary).toEqual({ claimed: 1, succeeded: 1, failed: 0 });

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
  });

  it('skips a link already polled within the window', async () => {
    const summary = await pollingService.pollDueLinks();
    expect(summary).toEqual({ claimed: 0, succeeded: 0, failed: 0 });

    expect(await pollRepo().count({ where: { url: FEED_URL } })).toBe(1);
    expect(await contentRepo().count({ where: { url: FEED_URL } })).toBe(2);
  });

  it('deduplicates unchanged items and stores only new ones on re-poll', async () => {
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

    const summary = await pollingService.pollDueLinks();
    expect(summary).toEqual({ claimed: 1, succeeded: 1, failed: 0 });

    const polls = await pollRepo().find({ where: { url: FEED_URL } });
    expect(polls).toHaveLength(1);
    expect(polls[0].contentIds).toHaveLength(3);

    // Two originals deduped, one new row added.
    expect(await contentRepo().count({ where: { url: FEED_URL } })).toBe(3);
  });

  it('refreshes the content of an existing guid on refetch', async () => {
    await pollRepo().delete({ url: FEED_URL });

    const before = await contentRepo().findOneOrFail({
      where: { url: FEED_URL, guid: 'guid-1' },
    });

    // Same guid, changed body.
    feedItems = feedItems.map((item) =>
      item.guid === 'guid-1' ? { ...item, description: 'updated body' } : item,
    );

    await pollingService.pollDueLinks();

    // No new row for the guid, but its content is refreshed.
    expect(await contentRepo().count({ where: { url: FEED_URL } })).toBe(3);
    const after = await contentRepo().findOneOrFail({
      where: { url: FEED_URL, guid: 'guid-1' },
    });
    expect(after.id).toBe(before.id);
    expect(JSON.parse(after.content).content).toBe('updated body');
  });
});
