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

describe('SharedRssFolders (e2e)', () => {
  let client: TestClient;
  let folderResourceId: string;
  let shareId: string;

  beforeAll(async () => {
    client = await TestClient.create();

    // Echo the article url back as markdown so the item detail has parsed
    // content to assert on.
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

  it('lists a shared rss folder items to an unauthenticated viewer, newest first', async () => {
    // client.request() sends no auth headers — a public viewer.
    const response = await client
      .request()
      .get(`/api/v1/shares/${shareId}/resources/${folderResourceId}/rss-items`)
      .expect(200);

    const items = response.body as Array<Record<string, unknown>>;
    expect(items.map((item) => item.title)).toEqual(['Newer', 'Older']);
    expect(items[0]).toMatchObject({
      id: expect.any(String),
      url: 'https://example.com/newer',
      published_at: new Date('Wed, 01 Apr 2026 00:00:00 GMT').toISOString(),
    });
  });

  it('reads a single shared rss item, including parsed content', async () => {
    const list = await client
      .request()
      .get(`/api/v1/shares/${shareId}/resources/${folderResourceId}/rss-items`)
      .expect(200);
    const itemId = (list.body as Array<{ id: string }>)[0].id;

    const response = await client
      .request()
      .get(
        `/api/v1/shares/${shareId}/resources/${folderResourceId}/rss-items/${itemId}`,
      )
      .expect(200);

    expect(response.body).toMatchObject({
      id: itemId,
      title: 'Newer',
      parsed_content: '# https://example.com/newer',
    });
  });

  it('rejects listing items for a resource not covered by the share', async () => {
    // The namespace root is not the shared folder and the share is not
    // all_resources, so it is not reachable.
    await client
      .request()
      .get(
        `/api/v1/shares/${shareId}/resources/${client.namespace.root_resource_id}/rss-items`,
      )
      .expect(404);
  });

  it('returns 404 for an unknown item id', async () => {
    await client
      .request()
      .get(
        `/api/v1/shares/${shareId}/resources/${folderResourceId}/rss-items/00000000-0000-0000-0000-000000000000`,
      )
      .expect(404);
  });

  it('returns 404 for an unknown share id', async () => {
    await client
      .request()
      .get(`/api/v1/shares/does-not-01/resources/${folderResourceId}/rss-items`)
      .expect(404);
  });
});
