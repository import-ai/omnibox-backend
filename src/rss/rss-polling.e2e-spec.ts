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

  it('ignores a rewritten body on refetch', async () => {
    parseRssItemSpy.mockClear();
    await pollRepo().delete({ url: FEED_URL });

    const before = await contentRepo().findOneOrFail({
      where: { url: FEED_URL, guid: 'guid-1' },
    });
    const [copyBefore] = await itemsOfGuid('guid-1');

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

    // An item is a snapshot of its first sighting: the row is written once, so
    // the revised body is not stored, not re-parsed and never reaches the copy.
    expect(await contentRepo().count({ where: { url: FEED_URL } })).toBe(3);
    const after = await contentRepo().findOneOrFail({
      where: { url: FEED_URL, guid: 'guid-1' },
    });
    expect(after.id).toBe(before.id);
    expect(JSON.parse(after.content).content).toBe('first body');
    expect(parseRssItemSpy).not.toHaveBeenCalled();
    expect(after.parsedContent).toBe(before.parsedContent);

    const copies = await itemsOfGuid('guid-1');
    expect(copies).toHaveLength(1);
    expect(copies[0].id).toBe(copyBefore.id);
    expect(copies[0].content).toBe(copyBefore.content);
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

  it('creates every copy of an item only once its parse settles', async () => {
    // Two folders on the same url again, this time with an item that fails to
    // parse: neither folder gets a copy until the parse finally lands.
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

    // First poll: the wizard fails, so the item is stored but unsettled — a copy
    // created now would carry the feed snippet for good, since the poller never
    // rewrites one.
    parseRssItemSpy.mockClear();
    parseRssItemSpy.mockRejectedValueOnce(new Error('wizard unavailable'));
    await pollRepo().delete({ url: FEED_URL });
    await pollingService.pollUrl(FEED_URL);

    expect(await itemsOfGuid('guid-fanned')).toHaveLength(0);
    const content = await contentRepo().findOneOrFail({
      where: { url: FEED_URL, guid: 'guid-fanned' },
    });
    expect(content.parsedContent).toBeNull();

    // Second poll, backoff elapsed: the parse succeeds, and both folders get
    // their copy of it in the same poll — identical, because both are built
    // from the one cached parse.
    await contentRepo().update(content.id, {
      parseNextAttemptAt: new Date(Date.now() - 1000),
    });
    parseRssItemSpy.mockClear();
    await pollRepo().delete({ url: FEED_URL });
    await pollingService.pollUrl(FEED_URL);
    expect(parseRssItemSpy).toHaveBeenCalledTimes(1);

    const copies = await itemsOfGuid('guid-fanned');
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
    // must not move its publish date forward.
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
    // The refetch is ignored wholesale, so both the title and the publish date
    // are still the ones stored on first sight.
    expect(second.title).toBe('Undated');
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

    // No copy yet: the poller writes a copy's body once, when it inserts it, so
    // an item with nothing settled to write is simply not listed.
    expect(await itemsOfGuid(RETRY_GUID)).toHaveLength(0);
  });

  it('leaves the item alone until its parse backoff has elapsed', async () => {
    parseRssItemSpy.mockClear();
    await pollRepo().delete({ url: FEED_URL });
    await pollingService.pollUrl(FEED_URL);

    // The scheduled retry is still in the future, so nothing is re-parsed and
    // the item stays unlisted.
    expect(parseRssItemSpy).not.toHaveBeenCalled();
    const stored = await contentRepo().findOneOrFail({
      where: { url: FEED_URL, guid: RETRY_GUID },
    });
    expect(stored.parsedContent).toBeNull();
    expect(stored.parseAttempts).toBe(1);
    expect(await itemsOfGuid(RETRY_GUID)).toHaveLength(0);
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

    // The retry parses the article inputs frozen into the stored row.
    expect(parseRssItemSpy).toHaveBeenCalledTimes(1);
    expect(parseRssItemSpy.mock.calls[0][0]).toMatchObject({
      url: 'https://example.com/flaky',
    });
    const after = await contentRepo().findOneOrFail({
      where: { url: FEED_URL, guid: RETRY_GUID },
    });
    expect(after.parsedContent).toBe('# https://example.com/flaky');
    expect(after.parseNextAttemptAt).toBeNull();

    // The item settles with this poll, which is also the poll that lists it.
    const [item] = await itemsOfGuid(RETRY_GUID);
    expect(item.content).toBe('# https://example.com/flaky');
  });

  it('never re-parses a parsed item, edited or not', async () => {
    const [before] = await itemsOfGuid(RETRY_GUID);
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

    // A parsed item is done: the edit is not stored, not parsed, and the copy
    // keeps the name and body it was created with.
    expect(parseRssItemSpy).not.toHaveBeenCalled();
    const stored = await contentRepo().findOneOrFail({
      where: { url: FEED_URL, guid: RETRY_GUID },
    });
    expect(stored.title).toBe('Flaky');
    expect(stored.parsedContent).toBe('# https://example.com/flaky');
    expect(stored.parseAttempts).toBe(1);
    expect(stored.parseNextAttemptAt).toBeNull();

    const copies = await itemsOfGuid(RETRY_GUID);
    expect(copies).toHaveLength(1);
    expect(copies[0].id).toBe(before.id);
    expect(copies[0].name).toBe('Flaky');
    expect(copies[0].content).toBe('# https://example.com/flaky');
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

  it('keeps retrying a long-failing item, at the maximum backoff', async () => {
    const stored = await contentRepo().findOneOrFail({
      where: { url: FEED_URL, guid: 'guid-empty' },
    });
    // Far past the point where the doubling stops, with the backoff elapsed.
    await contentRepo().update(stored.id, {
      parseAttempts: 20,
      parseNextAttemptAt: new Date(Date.now() - 1000),
    });

    parseRssItemSpy.mockClear();
    parseRssItemSpy.mockResolvedValueOnce({ markdown: '' });
    await pollRepo().delete({ url: FEED_URL });
    await pollingService.pollUrl(FEED_URL);

    // Retries never give up — an item that stopped being retried would never
    // be listed at all — and the interval has settled at its maximum.
    expect(parseRssItemSpy).toHaveBeenCalledTimes(1);
    const retried = await contentRepo().findOneOrFail({
      where: { url: FEED_URL, guid: 'guid-empty' },
    });
    expect(retried.parsedContent).toBeNull();
    expect(retried.parseAttempts).toBe(21);
    const maxIntervalMs = 5 * 60 * 1000 * 2 ** 6;
    const waitMs = (retried.parseNextAttemptAt?.getTime() ?? 0) - Date.now();
    expect(waitMs).toBeGreaterThan(maxIntervalMs - 60_000);
    expect(waitMs).toBeLessThanOrEqual(maxIntervalMs);
    expect(await itemsOfGuid('guid-empty')).toHaveLength(0);
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

  it('leaves a retired copy alone and polls a fresh one beside it', async () => {
    const [item] = await itemsOfGuid('guid-dup');
    await resourceRepo().softDelete({ id: item.id });

    await pollRepo().delete({ url: FEED_URL });
    expect(await pollingService.pollUrl(FEED_URL)).toBe('succeed');

    // A retired copy is history: it no longer counts as existing (the identity
    // index does not cover it either), so the poll creates a fresh live copy.
    const live = await itemsOfGuid('guid-dup');
    expect(live).toHaveLength(1);
    expect(live[0].id).not.toBe(item.id);
    // The retired row is untouched, not revived and not purged.
    const retired = await resourceRepo().findOneOrFail({
      where: { id: item.id },
      withDeleted: true,
    });
    expect(retired.deletedAt).not.toBeNull();
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
