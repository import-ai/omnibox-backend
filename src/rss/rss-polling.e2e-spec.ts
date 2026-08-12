import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';
import { RssItemContent } from 'omniboxd/rss/entities/rss-item-content.entity';
import { RssLink } from 'omniboxd/rss/entities/rss-link.entity';
import { RssPoll, RssPollStatus } from 'omniboxd/rss/entities/rss-poll.entity';
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

const fetchMock = jest.fn().mockImplementation(() => {
  return Promise.resolve({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(buildRss(feedItems)),
  });
});
global.fetch = fetchMock as unknown as typeof fetch;

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
  const linkRepo = () => dataSource.getRepository(RssLink);
  const resourceRepo = () => dataSource.getRepository(Resource);

  // Item resources of a folder, i.e. the folder's children of type rss_item.
  const folderItems = (parentId: string) =>
    resourceRepo().find({
      where: { parentId, resourceType: ResourceType.RSS_ITEM },
      order: { createdAt: 'DESC' },
    });

  const itemsOfGuid = (guid: string) =>
    resourceRepo()
      .createQueryBuilder('resource')
      .where('resource.resource_type = :type', {
        type: ResourceType.RSS_ITEM,
      })
      .andWhere("resource.attrs->>'guid' = :guid", { guid })
      .getMany();

  it('polls a due link and creates an item resource per feed item', async () => {
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

    // Each feed item became a resource parented to the rss folder.
    const [link] = await linkRepo().find({ where: { url: FEED_URL } });
    const items = await folderItems(folderResourceId);
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.name).sort()).toEqual(['First', 'Second']);
    for (const item of items) {
      expect(item.namespaceId).toBe(client.namespace.id);
      expect(item.userId).toBe(client.user.id);
      expect(item.attrs).toMatchObject({
        link_id: link.id,
        url: FEED_URL,
        guid: expect.any(String),
      });
    }

    // These items carry only a <description> (no <content:encoded>), so each is
    // parsed by fetching its article url, and the markdown is stored.
    expect(
      parseRssItemSpy.mock.calls.map((call) => call[0].url).sort(),
    ).toEqual(['https://example.com/1', 'https://example.com/2']);
    expect(contents.map((content) => content.parsedContent).sort()).toEqual([
      '# https://example.com/1',
      '# https://example.com/2',
    ]);
    // The item resource carries the parsed markdown as its body, sized for the
    // owner's storage quota.
    const first = items.find((item) => item.name === 'First')!;
    expect(first.content).toBe('# https://example.com/1');
    expect(Number(first.contentSize)).toBe(first.content.length);
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

    // Only the new item becomes a resource; the two existing ones are not
    // duplicated.
    const items = await folderItems(folderResourceId);
    expect(items.map((item) => item.name).sort()).toEqual([
      'First',
      'Second',
      'Third',
    ]);
  });

  it('lists the items as children of the rss folder resource', async () => {
    const response = await client
      .get(
        `/api/v1/namespaces/${client.namespace.id}/resources/${folderResourceId}/children`,
      )
      .expect(200);

    const items = response.body as Array<Record<string, unknown>>;
    expect(items.map((item) => item.name).sort()).toEqual([
      'First',
      'Second',
      'Third',
    ]);
    for (const item of items) {
      expect(item.resource_type).toBe('rss_item');
      // Clients gate edit/move/delete on this flag rather than on the type.
      expect(item.read_only).toBe(true);
    }
  });

  it('reads an item through the generic resource api', async () => {
    const [item] = await folderItems(folderResourceId);
    const response = await client
      .get(`/api/v1/namespaces/${client.namespace.id}/resources/${item.id}`)
      .expect(200);

    expect(response.body).toMatchObject({
      id: item.id,
      resource_type: 'rss_item',
      read_only: true,
      parent_id: folderResourceId,
      content: item.content,
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
      item.guid === 'guid-1'
        ? {
            ...item,
            description: 'updated body',
            link: 'https://example.com/1-updated',
          }
        : item,
    );

    await pollingService.pollUrl(FEED_URL);

    // No new row for the guid, but its content is refreshed.
    expect(await contentRepo().count({ where: { url: FEED_URL } })).toBe(3);
    const after = await contentRepo().findOneOrFail({
      where: { url: FEED_URL, guid: 'guid-1' },
    });
    expect(after.id).toBe(before.id);
    expect(JSON.parse(after.content).content).toBe('updated body');
    // The body changed, so the item is re-parsed against its new content.
    expect(parseRssItemSpy).toHaveBeenCalledTimes(1);
    expect(after.parsedContent).toBe('# https://example.com/1-updated');

    // The re-parsed markdown reaches the item resource, and no second copy is
    // created for the same guid.
    const copies = await itemsOfGuid('guid-1');
    expect(copies).toHaveLength(1);
    expect(copies[0].content).toBe('# https://example.com/1-updated');
  });

  it('gives a second folder on the same url its own item resources without re-fetching or re-parsing', async () => {
    // A second folder points at the same feed url, adding another rss_links
    // row. It lives in the private space: the teamspace folder quota is already
    // taken by the folder created in beforeAll.
    const privateRoot = (
      await client
        .get(`/api/v1/namespaces/${client.namespace.id}/private`)
        .expect(200)
    ).body;
    const secondFolderId = (
      await client
        .post(`/api/v1/namespaces/${client.namespace.id}/rss-folders`)
        .send({
          name: 'Poller 2',
          parent_id: privateRoot.id,
          links: [{ url: FEED_URL }],
        })
        .expect(201)
    ).body.resource.id;

    const links = await linkRepo().find({ where: { url: FEED_URL } });
    expect(links).toHaveLength(2);

    const contentsBefore = await contentRepo().find({
      where: { url: FEED_URL },
    });

    // Bypass the window and re-poll.
    parseRssItemSpy.mockClear();
    fetchMock.mockClear();
    await pollRepo().delete({ url: FEED_URL });
    await pollingService.pollUrl(FEED_URL);

    // The url is fetched once for both folders, and nothing is re-parsed: the
    // global (url, guid) cache already holds every item's markdown.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(parseRssItemSpy).not.toHaveBeenCalled();
    // Contents are still deduped globally per url.
    expect(await contentRepo().count({ where: { url: FEED_URL } })).toBe(3);

    // The second folder nonetheless gets its own copy of every item, with the
    // parsed content already in place.
    const firstItems = await folderItems(folderResourceId);
    const secondItems = await folderItems(secondFolderId);
    expect(firstItems).toHaveLength(3);
    expect(secondItems).toHaveLength(3);
    expect(secondItems.map((item) => item.name).sort()).toEqual(
      firstItems.map((item) => item.name).sort(),
    );
    // Separate rows, not shared ones.
    const firstIds = new Set(firstItems.map((item) => item.id));
    expect(secondItems.some((item) => firstIds.has(item.id))).toBe(false);
    const secondLink = links.find(
      (link) => link.resourceId === secondFolderId,
    )!;
    for (const item of secondItems) {
      expect(item.attrs.link_id).toBe(secondLink.id);
      expect(item.content).toBe(
        contentsBefore.find((content) => content.guid === item.attrs.guid)!
          .parsedContent,
      );
    }

    // Clean up: the private folder would otherwise hold the private-space rss
    // quota, and its items would keep showing up in per-guid assertions below.
    // Trashing a folder leaves its children in place (they merely become
    // unreachable), so retire the link and its items explicitly.
    await client
      .delete(
        `/api/v1/namespaces/${client.namespace.id}/rss-folders/${secondFolderId}`,
      )
      .expect(200);
    await linkRepo().softDelete({ id: secondLink.id });
    await resourceRepo().softDelete({ parentId: secondFolderId });
  });

  it('fans freshly parsed content out to every copy of an item', async () => {
    // Two folders on the same url again, this time with an item that has never
    // been parsed, so the parse happens while both copies already exist.
    const privateRoot = (
      await client
        .get(`/api/v1/namespaces/${client.namespace.id}/private`)
        .expect(200)
    ).body;
    const secondFolderId = (
      await client
        .post(`/api/v1/namespaces/${client.namespace.id}/rss-folders`)
        .send({
          name: 'Fan Out',
          parent_id: privateRoot.id,
          links: [{ url: FEED_URL }],
        })
        .expect(201)
    ).body.resource.id;

    feedItems = [
      {
        title: 'Fanned',
        link: 'https://example.com/fanned',
        guid: 'guid-fanned',
        description: 'fanned summary',
      },
    ];

    // First poll: the wizard fails, so both copies are created with the feed's
    // own summary as their body.
    parseRssItemSpy.mockClear();
    parseRssItemSpy.mockRejectedValueOnce(new Error('wizard unavailable'));
    await pollRepo().delete({ url: FEED_URL });
    await pollingService.pollUrl(FEED_URL);

    let copies = await itemsOfGuid('guid-fanned');
    expect(copies).toHaveLength(2);
    for (const copy of copies) {
      expect(copy.content).toBe('fanned summary');
    }

    // Second poll, backoff elapsed: the parse succeeds and its markdown lands
    // on both copies.
    const content = await contentRepo().findOneOrFail({
      where: { url: FEED_URL, guid: 'guid-fanned' },
    });
    await contentRepo().update(content.id, {
      parseNextAttemptAt: new Date(Date.now() - 1000),
    });
    parseRssItemSpy.mockClear();
    await pollRepo().delete({ url: FEED_URL });
    await pollingService.pollUrl(FEED_URL);
    expect(parseRssItemSpy).toHaveBeenCalledTimes(1);

    copies = await itemsOfGuid('guid-fanned');
    expect(copies).toHaveLength(2);
    for (const copy of copies) {
      expect(copy.content).toBe('# https://example.com/fanned');
      expect(Number(copy.contentSize)).toBe(copy.content.length);
    }

    await client
      .delete(
        `/api/v1/namespaces/${client.namespace.id}/rss-folders/${secondFolderId}`,
      )
      .expect(200);
    const secondLink = await linkRepo().findOneOrFail({
      where: { url: FEED_URL, resourceId: secondFolderId },
    });
    await linkRepo().softDelete({ id: secondLink.id });
    await resourceRepo().softDelete({ parentId: secondFolderId });
  });

  it('creates every item of a feed that repeats a title', async () => {
    // Feeds routinely reuse titles across items; identity is the guid, so all
    // of them must be created verbatim — neither renamed nor rejected as a
    // name conflict.
    feedItems = [
      {
        title: 'Weekly Digest',
        link: 'https://example.com/digest-1',
        guid: 'guid-digest-1',
        description: 'digest one',
      },
      {
        title: 'Weekly Digest',
        link: 'https://example.com/digest-2',
        guid: 'guid-digest-2',
        description: 'digest two',
      },
      {
        // A slash in a title would be rejected for a user-created resource.
        title: 'AC/DC news',
        link: 'https://example.com/slash',
        guid: 'guid-slash',
        description: 'slashed title',
      },
    ];

    await pollRepo().delete({ url: FEED_URL });
    expect(await pollingService.pollUrl(FEED_URL)).toBe('succeed');

    const items = await folderItems(folderResourceId);
    const digests = items.filter((item) => item.name === 'Weekly Digest');
    expect(digests).toHaveLength(2);
    expect(new Set(digests.map((item) => item.attrs.guid)).size).toBe(2);
    expect(items.some((item) => item.name === 'AC/DC news')).toBe(true);
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

  it('stores pub date/title and dates the item resource by publish time', async () => {
    // Added out of chronological order so the assertion proves the item
    // resources are dated by publish time, not insertion order.
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

    // Each item resource is created_at its publish date and carries it in attrs,
    // so the generic children listing can sort a feed newest-first.
    const items = await folderItems(folderResourceId);
    const byName = new Map(items.map((item) => [item.name, item]));
    for (const item of dated) {
      const resource = byName.get(item.title)!;
      expect(resource.createdAt.toISOString()).toBe(
        new Date(item.pubDate!).toISOString(),
      );
      expect(resource.attrs.published_at).toBe(
        new Date(item.pubDate!).toISOString(),
      );
    }
    expect(byName.get('Newest')!.createdAt.getTime()).toBeGreaterThan(
      byName.get('Middle')!.createdAt.getTime(),
    );
    expect(byName.get('Middle')!.createdAt.getTime()).toBeGreaterThan(
      byName.get('Oldest')!.createdAt.getTime(),
    );
  });

  it('keeps the original publish date when an undated item is re-fetched', async () => {
    // An item with no feed date is stored with the fetch time. Re-fetching it
    // updates the content but must not move its publish date forward.
    feedItems = [
      {
        title: 'Undated',
        link: 'https://example.com/undated',
        guid: 'guid-undated',
        description: 'no date here',
      },
    ];
    await pollRepo().delete({ url: FEED_URL });
    await pollingService.pollUrl(FEED_URL);
    const first = await contentRepo().findOneOrFail({
      where: { url: FEED_URL, guid: 'guid-undated' },
    });
    expect(first.pubDate).not.toBeNull();

    // Re-poll the same guid with changed content, bypassing the poll window.
    feedItems = [
      {
        title: 'Undated (edited)',
        link: 'https://example.com/undated',
        guid: 'guid-undated',
        description: 'still no date',
      },
    ];
    await pollRepo().delete({ url: FEED_URL });
    await pollingService.pollUrl(FEED_URL);
    const second = await contentRepo().findOneOrFail({
      where: { url: FEED_URL, guid: 'guid-undated' },
    });
    expect(second.title).toBe('Undated (edited)');
    expect(second.pubDate?.toISOString()).toBe(first.pubDate?.toISOString());
  });

  // A transient wizard failure (restart, timeout, network blip) must not leave an
  // item permanently unparsed: later polls retry it with a backoff.
  const RETRY_GUID = 'guid-retry';

  it('records an attempt with a backoff when the wizard parse fails', async () => {
    feedItems = [
      {
        title: 'Flaky',
        link: 'https://example.com/flaky',
        guid: RETRY_GUID,
        description: 'flaky body',
      },
    ];

    parseRssItemSpy.mockClear();
    parseRssItemSpy.mockRejectedValueOnce(new Error('wizard unavailable'));
    await pollRepo().delete({ url: FEED_URL });
    // The failed parse is swallowed, so the poll itself still succeeds.
    expect(await pollingService.pollUrl(FEED_URL)).toBe('succeed');

    expect(parseRssItemSpy).toHaveBeenCalledTimes(1);
    const stored = await contentRepo().findOneOrFail({
      where: { url: FEED_URL, guid: RETRY_GUID },
    });
    expect(stored.parsedContent).toBeNull();
    expect(stored.parseAttempts).toBe(1);
    const nextAt = stored.parseNextAttemptAt;
    expect(nextAt).not.toBeNull();
    expect(nextAt?.getTime() ?? 0).toBeGreaterThan(Date.now());

    // The item resource still exists, seeded with the feed's own summary.
    const [item] = await itemsOfGuid(RETRY_GUID);
    expect(item.content).toBe('flaky body');
  });

  it('leaves the item alone until its parse backoff has elapsed', async () => {
    parseRssItemSpy.mockClear();
    await pollRepo().delete({ url: FEED_URL });
    await pollingService.pollUrl(FEED_URL);

    // The scheduled retry is still in the future, so nothing is re-parsed.
    expect(parseRssItemSpy).not.toHaveBeenCalled();
    const stored = await contentRepo().findOneOrFail({
      where: { url: FEED_URL, guid: RETRY_GUID },
    });
    expect(stored.parsedContent).toBeNull();
    expect(stored.parseAttempts).toBe(1);
  });

  it('re-parses a failed item once its backoff has elapsed', async () => {
    const before = await contentRepo().findOneOrFail({
      where: { url: FEED_URL, guid: RETRY_GUID },
    });
    // Pretend the backoff window has passed.
    await contentRepo().update(before.id, {
      parseNextAttemptAt: new Date(Date.now() - 1000),
    });

    parseRssItemSpy.mockClear();
    await pollRepo().delete({ url: FEED_URL });
    await pollingService.pollUrl(FEED_URL);

    // The retry uses the article inputs taken fresh from the live feed.
    expect(parseRssItemSpy).toHaveBeenCalledTimes(1);
    expect(parseRssItemSpy.mock.calls[0][0]).toMatchObject({
      url: 'https://example.com/flaky',
    });
    const after = await contentRepo().findOneOrFail({
      where: { url: FEED_URL, guid: RETRY_GUID },
    });
    expect(after.parsedContent).toBe('# https://example.com/flaky');
    expect(after.parseNextAttemptAt).toBeNull();

    // The markdown replaces the summary the item resource started with.
    const [item] = await itemsOfGuid(RETRY_GUID);
    expect(item.content).toBe('# https://example.com/flaky');
  });

  it('re-parses when a parsed item is edited', async () => {
    feedItems = [
      {
        title: 'Flaky (edited)',
        link: 'https://example.com/flaky',
        guid: RETRY_GUID,
        description: 'edited body',
      },
    ];

    parseRssItemSpy.mockClear();
    await pollRepo().delete({ url: FEED_URL });
    await pollingService.pollUrl(FEED_URL);

    // The body changed, so the stale parse result is dropped and the revised
    // content is parsed afresh, with its retry bookkeeping reset.
    expect(parseRssItemSpy).toHaveBeenCalledTimes(1);
    const stored = await contentRepo().findOneOrFail({
      where: { url: FEED_URL, guid: RETRY_GUID },
    });
    expect(stored.title).toBe('Flaky (edited)');
    expect(stored.parsedContent).toBe('# https://example.com/flaky');
    expect(stored.parseAttempts).toBe(0);
    expect(stored.parseNextAttemptAt).toBeNull();

    // A revised item is refreshed in place, never duplicated: identity is the
    // guid, not the title.
    const copies = await itemsOfGuid(RETRY_GUID);
    expect(copies).toHaveLength(1);
    expect(copies[0].content).toBe('# https://example.com/flaky');
  });

  it('keeps parsed content when an unchanged item is refetched', async () => {
    // feedItems is unchanged from the previous test, so refetching the same
    // guid must leave the parsed result (and its bookkeeping) untouched.
    parseRssItemSpy.mockClear();
    await pollRepo().delete({ url: FEED_URL });
    await pollingService.pollUrl(FEED_URL);

    expect(parseRssItemSpy).not.toHaveBeenCalled();
    const stored = await contentRepo().findOneOrFail({
      where: { url: FEED_URL, guid: RETRY_GUID },
    });
    expect(stored.parsedContent).toBe('# https://example.com/flaky');
    expect(stored.parseAttempts).toBe(0);
  });

  it('treats empty wizard markdown as a failed attempt', async () => {
    feedItems = [
      {
        title: 'Empty',
        link: 'https://example.com/empty',
        guid: 'guid-empty',
        description: 'empty body',
      },
    ];

    parseRssItemSpy.mockClear();
    parseRssItemSpy.mockResolvedValueOnce({ markdown: '' });
    await pollRepo().delete({ url: FEED_URL });
    await pollingService.pollUrl(FEED_URL);

    expect(parseRssItemSpy).toHaveBeenCalledTimes(1);
    const stored = await contentRepo().findOneOrFail({
      where: { url: FEED_URL, guid: 'guid-empty' },
    });
    // Counted as an attempt: otherwise the item would be re-parsed on every
    // poll forever with no backoff.
    expect(stored.parsedContent).toBeNull();
    expect(stored.parseAttempts).toBe(1);
    expect(stored.parseNextAttemptAt).not.toBeNull();
  });

  it('stops retrying once the attempt cap is reached', async () => {
    const stored = await contentRepo().findOneOrFail({
      where: { url: FEED_URL, guid: 'guid-empty' },
    });
    // Exhaust the attempts (MAX_PARSE_ATTEMPTS) with the backoff already past.
    await contentRepo().update(stored.id, {
      parseAttempts: 6,
      parseNextAttemptAt: new Date(Date.now() - 1000),
    });

    parseRssItemSpy.mockClear();
    await pollRepo().delete({ url: FEED_URL });
    await pollingService.pollUrl(FEED_URL);

    expect(parseRssItemSpy).not.toHaveBeenCalled();
    const capped = await contentRepo().findOneOrFail({
      where: { url: FEED_URL, guid: 'guid-empty' },
    });
    expect(capped.parsedContent).toBeNull();
    expect(capped.parseAttempts).toBe(6);
  });

  // Restores the shared wizard stub to its default echo behavior; individual
  // tests that swap in their own implementation call this to avoid leaking it.
  const restoreDefaultWizardStub = () =>
    parseRssItemSpy.mockImplementation(
      (params: { url?: string; content?: string }) =>
        Promise.resolve({ markdown: `# ${params.url || 'content'}` }),
    );

  it('parses feed items in parallel up to the configured cap', async () => {
    // Eight fresh guids so every item needs a parse.
    feedItems = Array.from({ length: 8 }, (_, i) => ({
      title: `Parallel ${i}`,
      link: `https://example.com/parallel-${i}`,
      guid: `guid-parallel-${i}`,
      description: `parallel body ${i}`,
    }));

    let inFlight = 0;
    let maxInFlight = 0;
    parseRssItemSpy.mockClear();
    parseRssItemSpy.mockImplementation(async (params: { url?: string }) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      // Hold the slot briefly so concurrent parses overlap.
      await new Promise((resolve) => setTimeout(resolve, 20));
      inFlight -= 1;
      return { markdown: `# ${params.url || 'content'}` };
    });

    try {
      await pollRepo().delete({ url: FEED_URL });
      await pollingService.pollUrl(FEED_URL);
    } finally {
      restoreDefaultWizardStub();
    }

    expect(parseRssItemSpy).toHaveBeenCalledTimes(8);
    // More than one in flight proves parallelism; never above the default cap of
    // 5 (OBB_RSS_POLL_ITEM_CONCURRENCY is unset in tests).
    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(5);
  });

  it('stops processing items once the poll window elapses', async () => {
    feedItems = Array.from({ length: 4 }, (_, i) => ({
      title: `Windowed ${i}`,
      link: `https://example.com/windowed-${i}`,
      guid: `guid-windowed-${i}`,
      description: `windowed body ${i}`,
    }));

    parseRssItemSpy.mockClear();
    await pollRepo().delete({ url: FEED_URL });
    // maxRunMs 0: the deadline is already past when the first batch is checked,
    // so nothing is stored or parsed.
    await pollingService.pollUrl(FEED_URL, { maxRunMs: 0 });
    expect(parseRssItemSpy).not.toHaveBeenCalled();
    for (const item of feedItems) {
      expect(
        await contentRepo().count({
          where: { url: FEED_URL, guid: item.guid },
        }),
      ).toBe(0);
    }

    // A normal poll (full window) then processes every item, so truncation lost
    // nothing and the poll resumes cleanly.
    await pollRepo().delete({ url: FEED_URL });
    await pollingService.pollUrl(FEED_URL);
    expect(parseRssItemSpy).toHaveBeenCalledTimes(feedItems.length);
    for (const item of feedItems) {
      expect(
        await contentRepo().count({
          where: { url: FEED_URL, guid: item.guid },
        }),
      ).toBe(1);
    }
  });

  it('polls a feed that lists the same guid twice without error', async () => {
    // A malformed feed repeats a guid. The two items collapse to one content row,
    // so item creation must not try to create two resources with the same
    // (link, guid) identity.
    feedItems = [
      {
        title: 'Dup',
        link: 'https://example.com/dup',
        guid: 'guid-dup',
        description: 'dup body',
      },
      {
        title: 'Dup again',
        link: 'https://example.com/dup',
        guid: 'guid-dup',
        description: 'dup body',
      },
    ];

    parseRssItemSpy.mockClear();
    await pollRepo().delete({ url: FEED_URL });
    expect(await pollingService.pollUrl(FEED_URL)).toBe('succeed');

    // Deduped to a single content row and a single item resource per link.
    expect(
      await contentRepo().count({ where: { url: FEED_URL, guid: 'guid-dup' } }),
    ).toBe(1);
    expect(await itemsOfGuid('guid-dup')).toHaveLength(1);
  });

  it('never resurrects an item resource that was removed', async () => {
    const [item] = await itemsOfGuid('guid-dup');
    await resourceRepo().softDelete({ id: item.id });

    await pollRepo().delete({ url: FEED_URL });
    expect(await pollingService.pollUrl(FEED_URL)).toBe('succeed');

    // The soft-deleted copy still counts as existing, so nothing is re-created.
    expect(await itemsOfGuid('guid-dup')).toHaveLength(0);
  });

  it('skips a url whose poll is still in progress', async () => {
    await pollRepo().delete({ url: FEED_URL });
    // A worker is mid-poll: a fresh POLLING marker with no terminal row after it.
    const inProgress = await pollRepo().save(
      pollRepo().create({
        url: FEED_URL,
        status: RssPollStatus.POLLING,
        contentIds: [],
        error: null,
      }),
    );

    parseRssItemSpy.mockClear();
    // Claim must not overlap the in-progress worker.
    expect(await pollingService.pollUrl(FEED_URL)).toBe('skipped');
    expect(parseRssItemSpy).not.toHaveBeenCalled();

    // No new marker was inserted and the in-progress one is left untouched.
    const polls = await pollRepo().find({ where: { url: FEED_URL } });
    expect(polls).toHaveLength(1);
    expect(polls[0].id).toBe(inProgress.id);
    expect(polls[0].status).toBe('polling');
  });

  it('recovers a stale in-progress poll and re-claims the url', async () => {
    feedItems = [
      {
        title: 'Recovered',
        link: 'https://example.com/recovered',
        guid: 'guid-recovered',
        description: 'recovered body',
      },
    ];

    await pollRepo().delete({ url: FEED_URL });
    // A worker that died mid-poll left this marker behind; age it past the stale
    // threshold (POLL_STALE_MS = 10 min) so claim treats it as dead.
    const stale = await pollRepo().save(
      pollRepo().create({
        url: FEED_URL,
        status: RssPollStatus.POLLING,
        contentIds: [],
        error: null,
      }),
    );
    await pollRepo().query(
      `UPDATE rss_polls SET created_at = now() - interval '11 minutes' WHERE id = $1`,
      [stale.id],
    );

    parseRssItemSpy.mockClear();
    expect(await pollingService.pollUrl(FEED_URL)).toBe('succeed');

    // The stale marker is retired, and a fresh succeeding poll took over.
    const recovered = await pollRepo().findOneByOrFail({ id: stale.id });
    expect(recovered.status).toBe('failed');
    expect(recovered.error).toBe('stale poll recovered');
    const succeeded = await pollRepo().find({
      where: { url: FEED_URL, status: RssPollStatus.SUCCEED },
    });
    expect(succeeded).toHaveLength(1);
    expect(
      await contentRepo().count({
        where: { url: FEED_URL, guid: 'guid-recovered' },
      }),
    ).toBe(1);
  });
});
