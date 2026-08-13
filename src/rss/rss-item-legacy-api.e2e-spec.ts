import { NamespaceUsageDto } from 'omniboxd/namespaces/dto/namespace-usage.dto';
import { NamespacesQuotaService } from 'omniboxd/namespaces/namespaces-quota.service';
import { RssItemContent } from 'omniboxd/rss/entities/rss-item-content.entity';
import { RssPollingService } from 'omniboxd/rss/rss-polling.service';
import { WizardAPIService } from 'omniboxd/wizard-api/wizard-api.service';
import { TestClient } from 'test/test-client';
import { DataSource } from 'typeorm';

// The pre-2205 rss item endpoints, kept for clients that still call them while
// the web reads items through the generic resource routes. The contract under
// test is origin/main's: same paths, same query params, same json fields — now
// served from the `rss_item` resources the poller writes.
const FEED_MAIN = 'https://example.com/legacy-api-main';
const FEED_OTHER = 'https://example.com/legacy-api-other';
const FEED_RETIRED = 'https://example.com/legacy-api-retired';

// The list DTO's fields, exactly as origin/main emitted them.
const LIST_FIELDS = [
  'created_at',
  'id',
  'link_id',
  'link_name',
  'published_at',
  'summary',
  'title',
  'url',
];
const DETAIL_FIELDS = [...LIST_FIELDS, 'parsed_content'].sort();

// The legacy list item, as the endpoint emits it.
interface LegacyItem {
  id: string;
  link_id: string;
  link_name: string | null;
  title: string;
  url: string | null;
  summary: string | null;
  published_at: string | null;
  created_at: string;
}

interface FeedItem {
  title: string;
  link: string;
  guid: string;
  description: string;
  pubDate: string;
}

const feeds = new Map<string, FeedItem[]>();

function buildRss(items: FeedItem[]): string {
  const itemsXml = items
    .map(
      (item) => `
      <item>
        <title>${item.title}</title>
        <link>${item.link}</link>
        <guid>${item.guid}</guid>
        <description>${item.description}</description>
        <pubDate>${item.pubDate}</pubDate>
      </item>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Legacy Api Feed</title>
    <link>https://example.com</link>
    <description>Legacy</description>${itemsXml}
  </channel>
</rss>`;
}

const fetchMock = jest.fn().mockImplementation((url: string) => {
  const feed = feeds.get(url);
  if (!feed) {
    return Promise.reject(new Error('no such feed'));
  }
  return Promise.resolve({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(buildRss(feed)),
  });
});
global.fetch = fetchMock as unknown as typeof fetch;

// Deliberately out of publish order, so a listing that returned insertion order
// would fail the ordering assertions below.
const MAIN_ITEMS: FeedItem[] = [
  {
    title: 'Charlie',
    link: 'https://example.com/legacy/charlie',
    guid: 'legacy-charlie',
    description: 'charlie body',
    pubDate: 'Sun, 01 Mar 2026 00:00:00 GMT',
  },
  {
    title: 'Echo',
    link: 'https://example.com/legacy/echo',
    guid: 'legacy-echo',
    description: 'echo body',
    pubDate: 'Fri, 01 May 2026 00:00:00 GMT',
  },
  {
    title: 'Alpha',
    link: 'https://example.com/legacy/alpha',
    guid: 'legacy-alpha',
    description: 'alpha body',
    pubDate: 'Thu, 01 Jan 2026 00:00:00 GMT',
  },
  {
    title: 'Delta',
    link: 'https://example.com/legacy/delta',
    guid: 'legacy-delta',
    description: 'delta body',
    pubDate: 'Wed, 01 Apr 2026 00:00:00 GMT',
  },
  {
    title: 'Bravo',
    link: 'https://example.com/legacy/bravo',
    guid: 'legacy-bravo',
    description: 'bravo body',
    pubDate: 'Sun, 01 Feb 2026 00:00:00 GMT',
  },
];

const NEWEST_FIRST = ['Echo', 'Delta', 'Charlie', 'Bravo', 'Alpha'];

describe('RssItem legacy api (e2e)', () => {
  let client: TestClient;
  let otherClient: TestClient;
  let dataSource: DataSource;
  let mainFolderId: string;
  let mainLinkId: string;
  let otherFolderId: string;
  let retiredFolderId: string;
  let shareId: string;

  beforeAll(async () => {
    client = await TestClient.create();
    otherClient = await TestClient.create();
    dataSource = client.app.get(DataSource);
    jest
      .spyOn(client.app.get(WizardAPIService), 'parseRssItem')
      .mockImplementation((params: { url?: string; content?: string }) =>
        Promise.resolve({ markdown: `# ${params.url || 'content'}` }),
      );
    // The free tier allows a single folder with a single link; these cases need
    // several of both, and entitlements are not what is under test.
    jest
      .spyOn(client.app.get(NamespacesQuotaService), 'getNamespaceUsage')
      .mockImplementation(() => {
        const usage = new NamespaceUsageDto();
        usage.rssLinkLimit = 10;
        usage.rssFolderPrivateLimit = 10;
        usage.rssFolderTeamLimit = 10;
        return Promise.resolve(usage);
      });

    feeds.set(FEED_MAIN, MAIN_ITEMS);
    feeds.set(FEED_OTHER, [
      {
        title: 'Foreign',
        link: 'https://example.com/legacy/foreign',
        guid: 'legacy-foreign',
        description: 'foreign body',
        pubDate: 'Mon, 02 Feb 2026 00:00:00 GMT',
      },
    ]);
    feeds.set(FEED_RETIRED, [
      {
        title: 'Retired',
        link: 'https://example.com/legacy/retired',
        guid: 'legacy-retired',
        description: 'retired body',
        pubDate: 'Tue, 03 Feb 2026 00:00:00 GMT',
      },
    ]);

    mainFolderId = await createFolder('Main', [
      { url: FEED_MAIN, name: 'Main feed' },
    ]);
    mainLinkId = (
      await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/rss-folders/${mainFolderId}/config`,
        )
        .expect(200)
    ).body.links[0].id;
    otherFolderId = await createFolder('Other', [
      { url: FEED_OTHER, name: 'Other feed' },
    ]);
    retiredFolderId = await createFolder('Retiring', [
      { url: FEED_RETIRED, name: 'Retired feed' },
      { url: FEED_OTHER, name: 'Kept feed' },
    ]);

    const polling = client.app.get(RssPollingService);
    for (const url of [FEED_MAIN, FEED_OTHER, FEED_RETIRED]) {
      expect(await polling.pollUrl(url)).toBe('succeed');
    }

    // A public share covering the main folder only (all_resources defaults
    // false), which is what the shared read path authorizes against.
    shareId = (
      await client
        .patch(
          `/api/v1/namespaces/${client.namespace.id}/resources/${mainFolderId}/share`,
        )
        .send({ enabled: true })
        .expect(200)
    ).body.id;
    expect(shareId).toBeTruthy();
  });

  afterAll(async () => {
    await client.close();
    await otherClient.close();
  });

  async function createFolder(
    name: string,
    links: { url: string; name: string }[],
  ): Promise<string> {
    const created = await client
      .post(`/api/v1/namespaces/${client.namespace.id}/rss-folders`)
      .send({ name, parent_id: client.namespace.root_resource_id, links })
      .expect(201);
    return created.body.resource.id;
  }

  const itemsUrl = (folderId: string) =>
    `/api/v1/namespaces/${client.namespace.id}/rss-folders/${folderId}/items`;
  const sharedItemsUrl = (folderId: string) =>
    `/api/v1/shares/${shareId}/resources/${folderId}/rss-items`;

  const listItems = async (folderId: string, query = '') =>
    (await client.get(`${itemsUrl(folderId)}${query}`).expect(200))
      .body as LegacyItem[];

  it('lists a folder items with the legacy field set, newest published first', async () => {
    const items = await listItems(mainFolderId);

    expect(items.map((item) => item.title)).toEqual(NEWEST_FIRST);
    expect(Object.keys(items[0]).sort()).toEqual(LIST_FIELDS);

    const content = await dataSource
      .getRepository(RssItemContent)
      .findOneOrFail({ where: { url: FEED_MAIN, guid: 'legacy-echo' } });
    expect(items[0]).toEqual({
      id: expect.stringMatching(/^.{16}$/),
      link_id: mainLinkId,
      link_name: 'Main feed',
      title: 'Echo',
      // The article's own link, not the feed url.
      url: 'https://example.com/legacy/echo',
      summary: 'echo body',
      published_at: new Date('Fri, 01 May 2026 00:00:00 GMT').toISOString(),
      created_at: content.createdAt.toISOString(),
    });
  });

  it('pages with limit and offset without repeating or dropping a row', async () => {
    const all = await listItems(mainFolderId);
    expect(all).toHaveLength(5);

    const first = await listItems(mainFolderId, '?limit=2&offset=0');
    const middle = await listItems(mainFolderId, '?limit=2&offset=2');
    const last = await listItems(mainFolderId, '?limit=2&offset=4');
    const pastTheEnd = await listItems(mainFolderId, '?limit=2&offset=5');

    expect(first.map((item) => item.title)).toEqual(['Echo', 'Delta']);
    expect(middle.map((item) => item.title)).toEqual(['Charlie', 'Bravo']);
    expect(last.map((item) => item.title)).toEqual(['Alpha']);
    expect(pastTheEnd).toEqual([]);

    const paged = [...first, ...middle, ...last].map((item) => item.id);
    expect(paged).toEqual(all.map((item) => item.id));
    expect(new Set(paged).size).toBe(5);
  });

  it('reports created_at as first-seen and published_at as the feed date', async () => {
    const items = await listItems(mainFolderId);

    for (const item of items) {
      // The feed dates are all in the past; first-seen is this test run.
      expect(item.created_at).not.toEqual(item.published_at);
      expect(new Date(item.created_at).getTime()).toBeGreaterThan(
        new Date(item.published_at as string).getTime(),
      );
    }

    // created_at is the content cache row's, not the item resource's: the
    // resource is created_at its publish date so folders list newest first.
    const contents = await dataSource
      .getRepository(RssItemContent)
      .find({ where: { url: FEED_MAIN } });
    const firstSeenByTitle = new Map(
      contents.map((content) => [
        content.title,
        content.createdAt.toISOString(),
      ]),
    );
    for (const item of items) {
      expect(item.created_at).toBe(firstSeenByTitle.get(item.title));
    }
  });

  it('reads one item, including its parsed content', async () => {
    const [newest] = await listItems(mainFolderId, '?limit=1');

    const response = await client
      .get(`${itemsUrl(mainFolderId)}/${newest.id}`)
      .expect(200);

    expect(Object.keys(response.body).sort()).toEqual(DETAIL_FIELDS);
    expect(response.body).toEqual({
      ...newest,
      parsed_content: '# https://example.com/legacy/echo',
    });
  });

  it('returns 404 for an unknown item id', async () => {
    await client.get(`${itemsUrl(mainFolderId)}/doesnotexist1234`).expect(404);
  });

  it('does not leak an item of another folder', async () => {
    const [foreign] = await listItems(otherFolderId);
    expect(foreign.title).toBe('Foreign');

    // Reachable under its own folder, never under a sibling's.
    await client.get(`${itemsUrl(otherFolderId)}/${foreign.id}`).expect(200);
    await client.get(`${itemsUrl(mainFolderId)}/${foreign.id}`).expect(404);
  });

  it('drops items retired by removing a feed url', async () => {
    const before = await listItems(retiredFolderId);
    expect(before.map((item) => item.title).sort()).toEqual([
      'Foreign',
      'Retired',
    ]);
    const retiredItemId = before.find((item) => item.title === 'Retired')!.id;

    await client
      .patch(
        `/api/v1/namespaces/${client.namespace.id}/rss-folders/${retiredFolderId}/config`,
      )
      .send({ links: [{ url: FEED_OTHER, name: 'Kept feed' }] })
      .expect(200);

    const after = await listItems(retiredFolderId);
    expect(after.map((item) => item.title)).toEqual(['Foreign']);
    await client
      .get(`${itemsUrl(retiredFolderId)}/${retiredItemId}`)
      .expect(404);
  });

  it('refuses a user without access to the folder', async () => {
    await otherClient.get(`${itemsUrl(mainFolderId)}`).expect(403);
  });

  it('serves the shared list to an unauthenticated viewer, newest first', async () => {
    // client.request() sends no auth headers — a public viewer.
    const response = await client
      .request()
      .get(sharedItemsUrl(mainFolderId))
      .expect(200);

    const items = response.body as LegacyItem[];
    expect(items.map((item) => item.title)).toEqual(NEWEST_FIRST);
    expect(Object.keys(items[0]).sort()).toEqual(LIST_FIELDS);

    const page = (
      await client
        .request()
        .get(`${sharedItemsUrl(mainFolderId)}?limit=2&offset=2`)
        .expect(200)
    ).body as LegacyItem[];
    expect(page.map((item) => item.title)).toEqual(['Charlie', 'Bravo']);
  });

  it('serves a shared item detail to an unauthenticated viewer', async () => {
    const items = (
      await client.request().get(sharedItemsUrl(mainFolderId)).expect(200)
    ).body as Array<{ id: string }>;

    const response = await client
      .request()
      .get(`${sharedItemsUrl(mainFolderId)}/${items[0].id}`)
      .expect(200);

    expect(response.body).toMatchObject({
      id: items[0].id,
      title: 'Echo',
      parsed_content: '# https://example.com/legacy/echo',
    });
  });

  it('keeps items outside the share unreachable', async () => {
    const [foreign] = await listItems(otherFolderId);

    // The other folder is not covered by this share.
    await client.request().get(sharedItemsUrl(otherFolderId)).expect(404);
    await client
      .request()
      .get(`${sharedItemsUrl(otherFolderId)}/${foreign.id}`)
      .expect(404);
    // Nor is its item, asked for through the folder the share does cover.
    await client
      .request()
      .get(`${sharedItemsUrl(mainFolderId)}/${foreign.id}`)
      .expect(404);
    // And an unknown share is a 404, not a listing.
    await client
      .request()
      .get(`/api/v1/shares/doesnotexist/resources/${mainFolderId}/rss-items`)
      .expect(404);
  });
});
