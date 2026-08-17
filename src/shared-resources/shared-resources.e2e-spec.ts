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
      // Same gate as the workspace listing: a share viewer must be able to
      // tell a read-only resource apart without knowing the type.
      expect(item.read_only).toBe(true);
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
      read_only: true,
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

  it('pages a shared feed and reports how many items it holds', async () => {
    const first = await asViewer()
      .get(
        `/api/v1/shares/${shareId}/resources/${folderResourceId}/children?limit=1&offset=0`,
      )
      .expect(200);
    expect(first.body.map((item: { name: string }) => item.name)).toEqual([
      'Newer',
    ]);
    expect(first.headers['x-total-count']).toBe('2');

    const second = await asViewer()
      .get(
        `/api/v1/shares/${shareId}/resources/${folderResourceId}/children?limit=1&offset=1`,
      )
      .expect(200);
    expect(second.body.map((item: { name: string }) => item.name)).toEqual([
      'Older',
    ]);

    // Past the end the listing is empty rather than the first page again, so a
    // client paging to the bottom stops there.
    const third = await asViewer()
      .get(
        `/api/v1/shares/${shareId}/resources/${folderResourceId}/children?limit=1&offset=2`,
      )
      .expect(200);
    expect(third.body).toEqual([]);
    expect(third.headers['x-total-count']).toBe('2');
  });

  describe('paging an ordinary shared folder', () => {
    const PAGE_SIZE = 10;
    let pagedFolderId: string;
    let pagedShareId: string;

    beforeAll(async () => {
      pagedFolderId = (
        await client
          .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
          .send({
            name: 'Paged folder',
            resourceType: 'folder',
            parentId: client.namespace.root_resource_id,
          })
          .expect(201)
      ).body.id;
      // Exactly one page's worth: the size a client requests, so a listing that
      // ignored the window would look like there is always one more page.
      for (let index = 1; index <= PAGE_SIZE; index++) {
        await client
          .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
          .send({
            name: `Paged doc ${index}`,
            resourceType: 'doc',
            parentId: pagedFolderId,
          })
          .expect(201);
      }
      pagedShareId = (
        await client
          .patch(
            `/api/v1/namespaces/${client.namespace.id}/resources/${pagedFolderId}/share`,
          )
          .send({ enabled: true, all_resources: true })
          .expect(200)
      ).body.id;
    });

    const pageOf = (offset: number, limit: number) =>
      asViewer()
        .get(
          `/api/v1/shares/${pagedShareId}/resources/${pagedFolderId}/children?limit=${limit}&offset=${offset}`,
        )
        .expect(200);

    it('ends after a folder whose children exactly fill one page', async () => {
      const first = await pageOf(0, PAGE_SIZE);
      expect(first.body).toHaveLength(PAGE_SIZE);
      expect(first.headers['x-total-count']).toBe(String(PAGE_SIZE));

      const second = await pageOf(PAGE_SIZE, PAGE_SIZE);
      expect(second.body).toEqual([]);
    });

    it('walks the listing without repeating or dropping a child', async () => {
      const paged: string[] = [];
      for (let offset = 0; offset < PAGE_SIZE + 3; offset += 3) {
        const response = await pageOf(offset, 3);
        paged.push(
          ...response.body.map((child: { name: string }) => child.name),
        );
      }
      expect(new Set(paged).size).toBe(PAGE_SIZE);

      const whole = await asViewer()
        .get(
          `/api/v1/shares/${pagedShareId}/resources/${pagedFolderId}/children`,
        )
        .expect(200);
      expect(paged).toEqual(
        whole.body.map((child: { name: string }) => child.name),
      );
    });
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

  // A chat-only share lends its resources to the assistant, never to a visitor:
  // the public read paths are closed while chat and the internal paths that
  // build the assistant's visible resources stay open.
  describe('a chat-only share', () => {
    let chatOnlyFolderId: string;
    let chatOnlyDocId: string;
    let chatOnlyShareId: string;
    let openShareId: string;

    beforeAll(async () => {
      chatOnlyFolderId = (
        await client
          .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
          .send({
            name: 'Chat only folder',
            resourceType: 'folder',
            parentId: client.namespace.root_resource_id,
          })
          .expect(201)
      ).body.id;
      chatOnlyDocId = (
        await client
          .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
          .send({
            name: 'Chat only doc',
            resourceType: 'doc',
            parentId: chatOnlyFolderId,
          })
          .expect(201)
      ).body.id;

      chatOnlyShareId = (
        await client
          .patch(
            `/api/v1/namespaces/${client.namespace.id}/resources/${chatOnlyFolderId}/share`,
          )
          .send({ enabled: true, all_resources: true, share_type: 'chat_only' })
          .expect(200)
      ).body.id;

      // The same tree shared with everything on, to prove each 403 below comes
      // from the share type and not from the request itself.
      const openFolderId = (
        await client
          .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
          .send({
            name: 'Open folder',
            resourceType: 'folder',
            parentId: client.namespace.root_resource_id,
          })
          .expect(201)
      ).body.id;
      openShareId = (
        await client
          .patch(
            `/api/v1/namespaces/${client.namespace.id}/resources/${openFolderId}/share`,
          )
          .send({ enabled: true, all_resources: true, share_type: 'all' })
          .expect(200)
      ).body.id;
    });

    it('refuses to serve a resource, its children, its rss items or its attachments', async () => {
      const detail = await asViewer()
        .get(`/api/v1/shares/${chatOnlyShareId}/resources/${chatOnlyDocId}`)
        .expect(403);
      expect(detail.body.code).toBe('resource_not_allowed');

      await asViewer()
        .get(
          `/api/v1/shares/${chatOnlyShareId}/resources/${chatOnlyFolderId}/children`,
        )
        .expect(403);
      await asViewer()
        .get(
          `/api/v1/shares/${chatOnlyShareId}/resources/${chatOnlyFolderId}/rss-items`,
        )
        .expect(403);
      await asViewer()
        .get(
          `/api/v1/shares/${chatOnlyShareId}/resources/${chatOnlyFolderId}/rss-items/anyitem0001`,
        )
        .expect(403);
      await asViewer()
        .get(
          `/api/v1/shares/${chatOnlyShareId}/resources/${chatOnlyDocId}/attachments/anyattach01`,
        )
        .expect(403);
    });

    it('leaves the same endpoints open on a share that grants resources', async () => {
      await asViewer()
        .get(`/api/v1/shares/${openShareId}/resources/${chatOnlyDocId}`)
        .expect((response) => expect(response.status).not.toBe(403));
      await asViewer()
        .get(
          `/api/v1/shares/${openShareId}/resources/${chatOnlyDocId}/children`,
        )
        .expect((response) => expect(response.status).not.toBe(403));
      await asViewer()
        .get(
          `/api/v1/shares/${openShareId}/resources/${chatOnlyDocId}/attachments/anyattach01`,
        )
        .expect((response) => expect(response.status).not.toBe(403));
    });

    it('still describes itself to a visitor', async () => {
      const info = await asViewer()
        .get(`/api/v1/shares/${chatOnlyShareId}`)
        .expect(200);
      expect(info.body.share_type).toBe('chat_only');
    });

    it('still lets a visitor open a conversation', async () => {
      const conversation = await asViewer()
        .post(`/api/v1/shares/${chatOnlyShareId}/conversations`)
        .expect(201);
      expect(conversation.body.id).toBeTruthy();
    });

    it('still exposes the resources the assistant reads', async () => {
      const roots = await asViewer()
        .get(`/internal/api/v1/shares/${chatOnlyShareId}/resources/roots`)
        .expect(200);
      expect(roots.body.root.id).toBe(chatOnlyFolderId);

      const listed = await asViewer()
        .get(
          `/internal/api/v1/shares/${chatOnlyShareId}/resources/${chatOnlyFolderId}/list`,
        )
        .expect(200);
      expect(
        listed.body.resources.map((child: { name: string }) => child.name),
      ).toContain('Chat only doc');

      await asViewer()
        .get(
          `/internal/api/v1/shares/${chatOnlyShareId}/resources/${chatOnlyDocId}`,
        )
        .expect(200);
    });
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
