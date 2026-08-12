import { RssPollingService } from 'omniboxd/rss/rss-polling.service';
import { WizardAPIService } from 'omniboxd/wizard-api/wizard-api.service';
import { TestClient } from 'test/test-client';

const FEED_URL = 'https://example.com/shared-rss-feed';

interface FeedItem {
  title: string;
  link: string;
  guid: string;
  description: string;
  pubDate?: string;
}

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
        }
      </item>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Shared Feed</title>
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

// Rss items are ordinary resources, so they are shared through the generic
// shared-resource endpoints rather than an rss-specific read path.
describe('SharedResources (e2e)', () => {
  let client: TestClient;
  let folderResourceId: string;
  let docResourceId: string;
  let shareId: string;

  beforeAll(async () => {
    client = await TestClient.create();

    // Echo the article url back as markdown so each item has content to assert.
    jest
      .spyOn(client.app.get(WizardAPIService), 'parseRssItem')
      .mockImplementation((params: { url?: string; content?: string }) =>
        Promise.resolve({ markdown: `# ${params.url || 'content'}` }),
      );

    feedItems = [
      {
        title: 'Older',
        link: 'https://example.com/older',
        guid: 'shared-guid-older',
        description: 'older body',
        pubDate: 'Fri, 20 Feb 2026 00:00:00 GMT',
      },
      {
        title: 'Newer',
        link: 'https://example.com/newer',
        guid: 'shared-guid-newer',
        description: 'newer body',
        pubDate: 'Wed, 01 Apr 2026 00:00:00 GMT',
      },
    ];

    const created = await client
      .post(`/api/v1/namespaces/${client.namespace.id}/rss-folders`)
      .send({
        name: 'Shared Poller',
        parent_id: client.namespace.root_resource_id,
        links: [{ url: FEED_URL }],
      })
      .expect(201);
    folderResourceId = created.body.resource.id;

    // A sibling resource outside the share, used to prove the share's bounds.
    docResourceId = (
      await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .send({
          name: 'Not shared',
          resourceType: 'doc',
          parentId: client.namespace.root_resource_id,
        })
        .expect(201)
    ).body.id;

    // Populate items.
    await client.app.get(RssPollingService).pollUrl(FEED_URL);

    // Enable a public share on the rss folder (all_resources defaults false).
    const share = await client
      .patch(
        `/api/v1/namespaces/${client.namespace.id}/resources/${folderResourceId}/share`,
      )
      .send({ enabled: true })
      .expect(200);
    shareId = share.body.id;
    expect(shareId).toBeTruthy();
  });

  afterAll(async () => {
    await client.close();
  });

  // client.request() sends no auth headers — a public viewer.
  const asViewer = () => client.request();

  const listChildren = async (resourceId: string) =>
    (
      await asViewer()
        .get(`/api/v1/shares/${shareId}/resources/${resourceId}/children`)
        .expect(200)
    ).body as Array<Record<string, any>>;

  it('lists a shared rss folder items to an unauthenticated viewer', async () => {
    const items = await listChildren(folderResourceId);
    expect(items.map((item) => item.name).sort()).toEqual(['Newer', 'Older']);
    for (const item of items) {
      expect(item.resource_type).toBe('rss_item');
      expect(item.parent_id).toBe(folderResourceId);
    }
  });

  it('reads a single shared rss item, including its parsed content', async () => {
    const items = await listChildren(folderResourceId);
    const newer = items.find((item) => item.name === 'Newer')!;

    const response = await asViewer()
      .get(`/api/v1/shares/${shareId}/resources/${newer.id}`)
      .expect(200);

    expect(response.body).toMatchObject({
      id: newer.id,
      name: 'Newer',
      resource_type: 'rss_item',
      content: '# https://example.com/newer',
    });
    expect(response.body.attrs).toMatchObject({
      url: FEED_URL,
      guid: 'shared-guid-newer',
      published_at: new Date('Wed, 01 Apr 2026 00:00:00 GMT').toISOString(),
    });
  });

  it('orders a shared feed newest-published first', async () => {
    // The share's own sort (updated_at by default, and the poller rewrites an
    // item's body whenever it re-parses) must not reshuffle a feed: a visitor
    // reads it in the same order as its owner does.
    const items = await listChildren(folderResourceId);
    expect(items.map((item) => item.name)).toEqual(['Newer', 'Older']);
  });

  it('reports an rss item as a leaf', async () => {
    const items = await listChildren(folderResourceId);
    expect(await listChildren(items[0].id)).toEqual([]);
  });

  it('rejects a resource not covered by the share', async () => {
    // The share is not all_resources, so a sibling of the shared folder is not
    // reachable through it.
    await asViewer()
      .get(`/api/v1/shares/${shareId}/resources/${docResourceId}`)
      .expect(404);
    await asViewer()
      .get(
        `/api/v1/shares/${shareId}/resources/${client.namespace.root_resource_id}`,
      )
      .expect(404);
  });

  it('returns 404 for an unknown resource id', async () => {
    await asViewer()
      .get(`/api/v1/shares/${shareId}/resources/doesnotexist0001`)
      .expect(404);
  });

  it('returns 404 for an unknown share id', async () => {
    await asViewer()
      .get(`/api/v1/shares/does-not-01/resources/${folderResourceId}`)
      .expect(404);
  });

  it('stops serving the items once the share is disabled', async () => {
    await client
      .patch(
        `/api/v1/namespaces/${client.namespace.id}/resources/${folderResourceId}/share`,
      )
      .send({ enabled: false })
      .expect(200);

    await asViewer()
      .get(`/api/v1/shares/${shareId}/resources/${folderResourceId}/children`)
      .expect(404);
  });
});
