import { HttpStatus, Logger } from '@nestjs/common';
import { NamespaceUsageDto } from 'omniboxd/namespaces/dto/namespace-usage.dto';
import { NamespacesQuotaService } from 'omniboxd/namespaces/namespaces-quota.service';
import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { RssItemContent } from 'omniboxd/rss/entities/rss-item-content.entity';
import { RssLink } from 'omniboxd/rss/entities/rss-link.entity';
import { RssPoll } from 'omniboxd/rss/entities/rss-poll.entity';
import { RssPollingService } from 'omniboxd/rss/rss-polling.service';
import { StorageType } from 'omniboxd/storage-usages/entities/storage-usage.entity';
import { WizardAPIService } from 'omniboxd/wizard-api/wizard-api.service';
import { TestClient } from 'test/test-client';
import { DataSource, QueryFailedError } from 'typeorm';

// Feeds are addressed by url, so every scenario gets its own so that the specs
// never share poll state.
const FEED_A = 'https://example.com/lifecycle-a';
const FEED_B = 'https://example.com/lifecycle-b';
const FEED_SHARED = 'https://example.com/lifecycle-shared';
const FEED_ODD = 'https://example.com/lifecycle-odd';
const FEED_CHARGED = 'https://example.com/lifecycle-charged';
const FEED_EMPTY = 'https://example.com/lifecycle-empty';

interface FeedItem {
  title: string;
  link: string;
  guid?: string;
  description: string;
  pubDate?: string;
}

// What each url currently serves; a url mapped to null fails to fetch and one
// mapped to a raw string is served verbatim (malformed xml).
const feeds = new Map<string, FeedItem[] | string | null>();

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildRss(items: FeedItem[]): string {
  const itemsXml = items
    .map(
      (item) => `
      <item>
        <title>${escapeXml(item.title)}</title>
        <link>${item.link}</link>${
          item.guid === undefined
            ? ''
            : `\n        <guid>${escapeXml(item.guid)}</guid>`
        }
        <description>${escapeXml(item.description)}</description>${
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
    <title>Lifecycle Feed</title>
    <link>https://example.com</link>
    <description>Lifecycle</description>${itemsXml}
  </channel>
</rss>`;
}

const fetchCounts = new Map<string, number>();

const fetchMock = jest.fn().mockImplementation((url: string) => {
  fetchCounts.set(url, (fetchCounts.get(url) ?? 0) + 1);
  const feed = feeds.get(url);
  if (feed === null || feed === undefined) {
    return Promise.reject(new Error('network down'));
  }
  return Promise.resolve({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: () => Promise.resolve({}),
    text: () =>
      Promise.resolve(typeof feed === 'string' ? feed : buildRss(feed)),
  });
});
global.fetch = fetchMock as unknown as typeof fetch;

describe('RssItem lifecycle (e2e)', () => {
  let client: TestClient;
  let otherClient: TestClient;
  let pollingService: RssPollingService;
  let dataSource: DataSource;
  let parseSpy: jest.SpyInstance;

  beforeAll(async () => {
    client = await TestClient.create();
    otherClient = await TestClient.create();
    pollingService = client.app.get(RssPollingService);
    dataSource = client.app.get(DataSource);
    parseSpy = jest
      .spyOn(client.app.get(WizardAPIService), 'parseRssItem')
      .mockImplementation((params: { url?: string; content?: string }) =>
        Promise.resolve({ markdown: `# ${params.url || 'content'}` }),
      );
    // The second app has its own DI container, so its wizard client needs the
    // same stub; both write to the one shared database.
    jest
      .spyOn(otherClient.app.get(WizardAPIService), 'parseRssItem')
      .mockImplementation((params: { url?: string; content?: string }) =>
        Promise.resolve({ markdown: `# ${params.url || 'content'}` }),
      );
    // The free-tier defaults (one folder per space, one link per folder) are
    // about entitlements, not about the behavior under test; lift them so a
    // single namespace can hold the several folders and links these cases need.
    for (const app of [client.app, otherClient.app]) {
      jest
        .spyOn(app.get(NamespacesQuotaService), 'getNamespaceUsage')
        .mockImplementation(() => {
          const usage = new NamespaceUsageDto();
          usage.rssLinkLimit = 10;
          usage.rssFolderPrivateLimit = 10;
          usage.rssFolderTeamLimit = 10;
          return Promise.resolve(usage);
        });
    }
  });

  afterAll(async () => {
    await client.close();
    await otherClient.close();
  });

  const resourceRepo = () => dataSource.getRepository(Resource);
  const linkRepo = () => dataSource.getRepository(RssLink);
  const pollRepo = () => dataSource.getRepository(RssPoll);
  const contentRepo = () => dataSource.getRepository(RssItemContent);

  // Re-poll a url immediately, bypassing the 5-minute claim window.
  const repoll = async (url: string) => {
    await pollRepo().delete({ url });
    return await pollingService.pollUrl(url);
  };

  const folderItems = (parentId: string, withDeleted = false) =>
    resourceRepo().find({
      where: { parentId, resourceType: ResourceType.RSS_ITEM },
      order: { createdAt: 'DESC' },
      withDeleted,
    });

  const createFolder = async (
    owner: TestClient,
    name: string,
    parentId: string,
    urls: string[],
  ) => {
    const response = await owner
      .post(`/api/v1/namespaces/${owner.namespace.id}/rss-folders`)
      .send({
        name,
        parent_id: parentId,
        links: urls.map((url) => ({ url })),
      })
      .expect(201);
    return response.body as {
      resource: { id: string };
      links: Array<{ id: string; url: string }>;
    };
  };

  const privateRootId = async (owner: TestClient) =>
    (
      await owner
        .get(`/api/v1/namespaces/${owner.namespace.id}/private`)
        .expect(200)
    ).body.id as string;

  // Records everything the app logs at warn/error until restore(), so a test
  // can assert that a code path stayed quiet (a swallowed unique violation, for
  // instance, is only ever visible as a log line).
  const captureLogs = () => {
    const messages: string[] = [];
    const spies = (['warn', 'error'] as const).map((level) =>
      jest
        .spyOn(Logger.prototype, level)
        .mockImplementation((message: unknown) => {
          messages.push(String(message));
        }),
    );
    return {
      restore: () => spies.forEach((spy) => spy.mockRestore()),
      matching: (pattern: RegExp) =>
        messages.filter((message) => pattern.test(message)),
    };
  };

  const indexTaskCount = async (resourceId: string) => {
    const rows: Array<{ count: string }> = await dataSource.query(
      `SELECT count(*) FROM tasks WHERE resource_id = $1 AND function = 'upsert_index'`,
      [resourceId],
    );
    return Number(rows[0].count);
  };

  const contentUsage = async (namespaceId: string, userId: string) => {
    const row: Array<{ amount: string }> = await dataSource.query(
      `SELECT amount FROM storage_usages
        WHERE namespace_id = $1 AND user_id = $2 AND storage_type = $3
          AND deleted_at IS NULL`,
      [namespaceId, userId, StorageType.CONTENT],
    );
    return Number(row[0]?.amount ?? 0);
  };

  describe('multiple links in one folder', () => {
    let folderId: string;
    let links: Array<{ id: string; url: string }>;

    beforeAll(async () => {
      feeds.set(FEED_A, [
        {
          title: 'A older',
          link: 'https://example.com/a-old',
          guid: 'a-old',
          description: 'a old',
          pubDate: 'Mon, 02 Feb 2026 00:00:00 GMT',
        },
        {
          title: 'A newer',
          link: 'https://example.com/a-new',
          guid: 'a-new',
          description: 'a new',
          pubDate: 'Wed, 04 Feb 2026 00:00:00 GMT',
        },
      ]);
      feeds.set(FEED_B, [
        {
          title: 'B middle',
          link: 'https://example.com/b-mid',
          guid: 'b-mid',
          description: 'b mid',
          pubDate: 'Tue, 03 Feb 2026 00:00:00 GMT',
        },
      ]);
      const created = await createFolder(
        client,
        'Multi link',
        client.namespace.root_resource_id,
        [FEED_A, FEED_B],
      );
      folderId = created.resource.id;
      links = created.links;
      await repoll(FEED_A);
      await repoll(FEED_B);
    });

    it('tags every item with the link it came from', async () => {
      const items = await folderItems(folderId);
      expect(items).toHaveLength(3);
      const linkIdByUrl = new Map(links.map((link) => [link.url, link.id]));
      const byName = new Map(items.map((item) => [item.name, item]));
      expect(byName.get('A older')!.attrs.link_id).toBe(
        linkIdByUrl.get(FEED_A),
      );
      expect(byName.get('A newer')!.attrs.link_id).toBe(
        linkIdByUrl.get(FEED_A),
      );
      expect(byName.get('B middle')!.attrs.link_id).toBe(
        linkIdByUrl.get(FEED_B),
      );
    });

    it('merges both feeds newest-published-first in the children listing', async () => {
      const response = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/${folderId}/children` +
            `?sort_by=created_at&sort_order=desc`,
        )
        .expect(200);
      expect(
        (response.body as Array<{ name: string }>).map((item) => item.name),
      ).toEqual(['A newer', 'B middle', 'A older']);
    });

    it('re-polls idempotently: no duplicates and no content churn', async () => {
      const before = await folderItems(folderId);
      parseSpy.mockClear();
      expect(await repoll(FEED_A)).toBe('succeed');
      expect(await repoll(FEED_B)).toBe('succeed');
      const after = await folderItems(folderId);

      expect(after.map((item) => item.id).sort()).toEqual(
        before.map((item) => item.id).sort(),
      );
      expect(after.map((item) => item.updatedAt.getTime()).sort()).toEqual(
        before.map((item) => item.updatedAt.getTime()).sort(),
      );
      // Nothing changed, so no url is parsed again.
      expect(parseSpy).not.toHaveBeenCalled();
    });

    it('drops only the removed link’s items when a url is removed', async () => {
      const feedALinkId = links.find((link) => link.url === FEED_A)!.id;
      await client
        .patch(
          `/api/v1/namespaces/${client.namespace.id}/rss-folders/${folderId}/config`,
        )
        .send({ links: [{ url: FEED_B }] })
        .expect(200);

      const live = await folderItems(folderId);
      expect(live.map((item) => item.name)).toEqual(['B middle']);
      const removed = (await folderItems(folderId, true)).filter(
        (item) => item.attrs.link_id === feedALinkId,
      );
      expect(removed).toHaveLength(2);
      for (const item of removed) {
        expect(item.deletedAt).not.toBeNull();
      }
      // The link row itself is retired, not deleted.
      const link = await linkRepo().findOne({
        where: { id: feedALinkId },
        withDeleted: true,
      });
      expect(link?.deletedAt).not.toBeNull();
    });

    it('re-adds a removed url, and a retired copy never blocks a fresh one', async () => {
      const feedALinkId = links.find((link) => link.url === FEED_A)!.id;
      const retiredBefore = (await folderItems(folderId, true)).filter(
        (item) => item.attrs.link_id === feedALinkId,
      );
      expect(retiredBefore).toHaveLength(2);
      // The (url, guid) fetch/parse cache is global and outlives the
      // subscription, which is what makes coming back cost nothing.
      const cachedBefore = await contentRepo().find({
        where: { url: FEED_A },
        order: { guid: 'ASC' },
      });
      expect(cachedBefore).toHaveLength(2);

      const updated = await client
        .patch(
          `/api/v1/namespaces/${client.namespace.id}/rss-folders/${folderId}/config`,
        )
        .send({ links: [{ url: FEED_B }, { url: FEED_A }] })
        .expect(200);
      const newLinkId = (
        updated.body.links as Array<{ id: string; url: string }>
      ).find((link) => link.url === FEED_A)!.id;
      // A removed link row is retired, never reused, so the url comes back on a
      // link of its own.
      expect(newLinkId).not.toBe(feedALinkId);

      parseSpy.mockClear();
      const fetchesBefore = fetchCounts.get(FEED_A) ?? 0;
      const logged = captureLogs();
      try {
        expect(await repoll(FEED_A)).toBe('succeed');
      } finally {
        logged.restore();
      }

      const live = await folderItems(folderId);
      expect(live.map((item) => item.name).sort()).toEqual([
        'A newer',
        'A older',
        'B middle',
      ]);
      // The folder's copies are fresh live rows on the new link, not the
      // retired ones brought back.
      const revived = live.filter((item) => item.name.startsWith('A '));
      const retiredIds = new Set(retiredBefore.map((item) => item.id));
      for (const item of revived) {
        expect(item.attrs.link_id).toBe(newLinkId);
        expect(item.deletedAt).toBeNull();
        expect(retiredIds.has(item.id)).toBe(false);
      }

      // The retired rows still exist, still retired, still on the old link.
      const all = await folderItems(folderId, true);
      const retiredAfter = all.filter(
        (item) => item.attrs.link_id === feedALinkId,
      );
      expect(retiredAfter.map((item) => item.id).sort()).toEqual(
        [...retiredIds].sort(),
      );
      for (const item of retiredAfter) {
        expect(item.deletedAt).not.toBeNull();
      }

      // Identity holds where it now applies: among live rows only. The retired
      // rows repeat those guids under their old link, and that is allowed.
      const liveIdentities = all
        .filter((item) => item.deletedAt === null)
        .map((item) => `${item.attrs.link_id}:${item.attrs.guid}`);
      expect(new Set(liveIdentities).size).toBe(liveIdentities.length);
      expect(retiredAfter.map((item) => item.attrs.guid).sort()).toEqual(
        revived.map((item) => item.attrs.guid).sort(),
      );

      // Nothing collided on the identity index on the way in.
      expect(logged.matching(/identity|duplicate key|23505/i)).toEqual([]);

      // The feed itself is read once (that is what a poll does), but no article
      // is fetched or parsed again: the cache rows are the very same ones.
      expect(parseSpy).not.toHaveBeenCalled();
      expect(fetchCounts.get(FEED_A)).toBe(fetchesBefore + 1);
      const cachedAfter = await contentRepo().find({
        where: { url: FEED_A },
        order: { guid: 'ASC' },
      });
      expect(cachedAfter.map((row) => row.id)).toEqual(
        cachedBefore.map((row) => row.id),
      );
      expect(cachedAfter.map((row) => row.parsedContent)).toEqual(
        cachedBefore.map((row) => row.parsedContent),
      );

      // Everything above would hold even if a retired copy still reserved its
      // identity: a re-added url comes back on a NEW link, so none of these
      // copies repeats a retired row's (link_id, guid). What the live-only
      // identity actually buys is a copy retired under a link that is still
      // subscribed. Nothing user-facing retires a single item — items go with
      // their link or their folder — so retire them directly, then poll again.
      const revivedIds = revived.map((item) => item.id);
      await resourceRepo().softDelete(revivedIds);
      expect((await folderItems(folderId)).map((item) => item.name)).toEqual([
        'B middle',
      ]);

      parseSpy.mockClear();
      expect(await repoll(FEED_A)).toBe('succeed');

      // The folder gets the articles back as new rows on the same live link.
      // A poll that counted retired copies as existing would skip them here and
      // the folder would be short of those articles for good.
      const fresh = (await folderItems(folderId)).filter((item) =>
        item.name.startsWith('A '),
      );
      expect(fresh.map((item) => item.name).sort()).toEqual([
        'A newer',
        'A older',
      ]);
      for (const item of fresh) {
        expect(item.attrs.link_id).toBe(newLinkId);
        expect(revivedIds).not.toContain(item.id);
      }
      // The rows retired a moment ago keep their identity and stay retired.
      for (const id of revivedIds) {
        const row = await resourceRepo().findOneOrFail({
          where: { id },
          withDeleted: true,
        });
        expect(row.deletedAt).not.toBeNull();
        expect(fresh.map((item) => item.attrs.guid)).toContain(
          row.attrs.guid as string,
        );
      }
      // Still no article fetched or parsed again: only the cache is consulted.
      expect(parseSpy).not.toHaveBeenCalled();
    });
  });

  describe('fan-out across namespaces', () => {
    let firstFolderId: string;
    let secondFolderId: string;

    beforeAll(async () => {
      feeds.set(FEED_SHARED, [
        {
          title: 'Shared one',
          link: 'https://example.com/shared-1',
          guid: 'shared-1',
          description: 'shared one',
        },
      ]);
      firstFolderId = (
        await createFolder(client, 'Shared here', await privateRootId(client), [
          FEED_SHARED,
        ])
      ).resource.id;
      secondFolderId = (
        await createFolder(
          otherClient,
          'Shared there',
          otherClient.namespace.root_resource_id,
          [FEED_SHARED],
        )
      ).resource.id;
    });

    it('costs one fetch and one parse for two namespaces, with a copy each', async () => {
      fetchCounts.delete(FEED_SHARED);
      parseSpy.mockClear();
      expect(await repoll(FEED_SHARED)).toBe('succeed');

      expect(fetchCounts.get(FEED_SHARED)).toBe(1);
      expect(parseSpy).toHaveBeenCalledTimes(1);
      expect(await pollRepo().count({ where: { url: FEED_SHARED } })).toBe(1);
      expect(await contentRepo().count({ where: { url: FEED_SHARED } })).toBe(
        1,
      );

      const here = await folderItems(firstFolderId);
      const there = await folderItems(secondFolderId);
      expect(here).toHaveLength(1);
      expect(there).toHaveLength(1);
      expect(here[0].id).not.toBe(there[0].id);
      expect(here[0].namespaceId).toBe(client.namespace.id);
      expect(there[0].namespaceId).toBe(otherClient.namespace.id);
      expect(here[0].attrs.link_id).not.toBe(there[0].attrs.link_id);
      expect(here[0].content).toBe(there[0].content);
      expect(here[0].userId).toBe(client.user.id);
      expect(there[0].userId).toBe(otherClient.user.id);
    });

    it('gives a later subscriber a copy identical to the first, unparsed again', async () => {
      const [here] = await folderItems(firstFolderId);
      // A third folder, in the first namespace, subscribes long after the
      // article was parsed.
      const thirdFolderId = (
        await createFolder(
          client,
          'Shared later',
          await privateRootId(client),
          [FEED_SHARED],
        )
      ).resource.id;

      parseSpy.mockClear();
      expect(await repoll(FEED_SHARED)).toBe('succeed');
      expect(parseSpy).not.toHaveBeenCalled();

      // Built from the same cached parse as the copies that came before it, so
      // it matches them byte for byte without anything being rewritten.
      const [later] = await folderItems(thirdFolderId);
      expect(later.id).not.toBe(here.id);
      expect(later.content).toBe(here.content);
      expect(later.name).toBe(here.name);
      expect(later.attrs.guid).toBe(here.attrs.guid);
      expect(Number(later.contentSize)).toBe(Number(here.contentSize));
    });

    it('leaves the copies it already made alone when the feed revises the item', async () => {
      const before = await folderItems(firstFolderId);
      const tasksBefore = await indexTaskCount(before[0].id);
      const usageBefore = await contentUsage(
        client.namespace.id,
        client.user.id,
      );

      feeds.set(FEED_SHARED, [
        {
          title: 'Shared one, retitled',
          link: 'https://example.com/shared-1-v2',
          guid: 'shared-1',
          description: 'shared one, revised',
        },
      ]);
      parseSpy.mockClear();
      expect(await repoll(FEED_SHARED)).toBe('succeed');

      // The poller only ever inserts: the revision is not parsed, no copy's
      // name or body moves, and no index task is re-emitted for it.
      expect(parseSpy).not.toHaveBeenCalled();
      const after = await folderItems(firstFolderId);
      expect(after.map((item) => item.id)).toEqual(
        before.map((item) => item.id),
      );
      expect(after[0].name).toBe(before[0].name);
      expect(after[0].content).toBe(before[0].content);
      expect(await indexTaskCount(before[0].id)).toBe(tasksBefore);
      expect(await contentUsage(client.namespace.id, client.user.id)).toBe(
        usageBefore,
      );
    });
  });

  describe('feed edge cases', () => {
    let folderId: string;

    beforeAll(async () => {
      // The url is validated (fetched) when the folder is created, so it must
      // already resolve to a feed before the first case rewrites it.
      feeds.set(FEED_ODD, []);
      folderId = (
        await createFolder(
          otherClient,
          'Odd feed',
          await privateRootId(otherClient),
          [FEED_ODD],
        )
      ).resource.id;
    });

    it('derives a stable guid for items that have none', async () => {
      feeds.set(FEED_ODD, [
        {
          title: 'No guid',
          link: 'https://example.com/no-guid',
          description: 'no guid body',
        },
      ]);
      expect(await repoll(FEED_ODD)).toBe('succeed');
      const first = await folderItems(folderId);
      expect(first).toHaveLength(1);
      const guid = first[0].attrs.guid as string;
      expect(guid).toMatch(/^[0-9a-f]{64}$/);

      // The same item on a later poll hashes to the same guid, so it is not
      // duplicated.
      expect(await repoll(FEED_ODD)).toBe('succeed');
      const second = await folderItems(folderId);
      expect(second).toHaveLength(1);
      expect(second[0].attrs.guid).toBe(guid);
    });

    it('accepts hostile titles verbatim', async () => {
      const titles = [
        'Ünïcødé — ünd Ümlaut',
        '🎉 emoji title 🚀',
        'quote "inside" and \'single\'',
        'a'.repeat(300),
        '',
      ];
      feeds.set(
        FEED_ODD,
        titles.map((title, index) => ({
          title,
          link: `https://example.com/odd-${index}`,
          guid: `odd-${index}`,
          description: `odd ${index}`,
        })),
      );
      expect(await repoll(FEED_ODD)).toBe('succeed');

      const items = await folderItems(folderId);
      const byGuid = new Map(items.map((item) => [item.attrs.guid, item]));
      titles.forEach((title, index) => {
        // Names are stored verbatim: no truncation, no "(2)" suffix, no
        // slash rejection.
        expect(byGuid.get(`odd-${index}`)!.name).toBe(title);
      });
    });

    it('keeps the name it was created with when the feed retitles an item', async () => {
      feeds.set(FEED_ODD, [
        {
          title: 'Typo in the headlien',
          link: 'https://example.com/typo',
          guid: 'typo',
          description: 'typo body',
        },
      ]);
      expect(await repoll(FEED_ODD)).toBe('succeed');
      const [before] = (await folderItems(folderId)).filter(
        (item) => item.attrs.guid === 'typo',
      );
      expect(before.name).toBe('Typo in the headlien');

      feeds.set(FEED_ODD, [
        {
          title: 'Typo in the headline',
          link: 'https://example.com/typo',
          guid: 'typo',
          description: 'typo body',
        },
      ]);
      expect(await repoll(FEED_ODD)).toBe('succeed');

      const [after] = (await folderItems(folderId)).filter(
        (item) => item.attrs.guid === 'typo',
      );
      // A copy is written once and never updated, so the corrected headline is
      // ignored; identity is the guid, so no second copy appears either.
      expect(after.id).toBe(before.id);
      expect(after.name).toBe('Typo in the headlien');
    });

    it('keeps existing items when they disappear from the feed', async () => {
      const before = await folderItems(folderId);
      expect(before.length).toBeGreaterThan(1);
      feeds.set(FEED_ODD, []);
      expect(await repoll(FEED_ODD)).toBe('succeed');
      const after = await folderItems(folderId);
      expect(after.map((item) => item.id).sort()).toEqual(
        before.map((item) => item.id).sort(),
      );
    });

    it('fails cleanly on a fetch error and leaves items intact', async () => {
      const before = await folderItems(folderId);
      feeds.set(FEED_ODD, null);
      expect(await repoll(FEED_ODD)).toBe('failed');
      const poll = await pollRepo().findOneOrFail({
        where: { url: FEED_ODD },
      });
      expect(poll.status).toBe('failed');
      expect(await folderItems(folderId)).toHaveLength(before.length);
    });

    it('fails cleanly on malformed xml and leaves items intact', async () => {
      const before = await folderItems(folderId);
      feeds.set(FEED_ODD, '<rss><channel><item><title>unterminated');
      expect(await repoll(FEED_ODD)).toBe('failed');
      expect(await folderItems(folderId)).toHaveLength(before.length);
    });
  });

  // Items are poller-owned, read-only and stored once per subscribing folder:
  // the same article would otherwise be billed to its owner once per folder,
  // for content they never uploaded and cannot delete on its own. So no rss
  // item path — create, retire, restore — touches the owner's
  // storage usage at all, in either direction. The row's own content_size is
  // still maintained; only the quota bookkeeping skips it.
  describe('storage accounting', () => {
    let folderId: string;
    let itemId: string;
    let itemSize: number;
    let docSize: number;

    // A real document of the owner's, so every case below reads against a
    // non-zero baseline: a stray refund for an item would show up as the usage
    // dropping below the bytes this document genuinely occupies, and with the
    // items retired it would take the amount negative.
    beforeAll(async () => {
      const content = 'a document that holds the baseline up';
      docSize = Buffer.byteLength(content, 'utf8');
      await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .send({
          parentId: client.namespace.root_resource_id,
          resourceType: ResourceType.DOC,
          name: 'Baseline doc',
          content,
        })
        .expect(201);
    });

    it('charges nothing for the items a poll brings in', async () => {
      feeds.set(
        FEED_CHARGED,
        Array.from({ length: 3 }, (_unused, index) => ({
          title: `Charged ${index}`,
          link: `https://example.com/charged-${index}`,
          guid: `charged-${index}`,
          description: `charged body ${index}`,
        })),
      );
      const before = await contentUsage(client.namespace.id, client.user.id);
      expect(before).toBe(docSize);
      folderId = (
        await createFolder(
          client,
          'Charged folder',
          client.namespace.root_resource_id,
          [FEED_CHARGED],
        )
      ).resource.id;
      expect(await repoll(FEED_CHARGED)).toBe('succeed');

      const items = await folderItems(folderId);
      expect(items).toHaveLength(3);
      itemId = items[0].id;
      itemSize = items.reduce((sum, item) => sum + Number(item.contentSize), 0);
      // Every row still records its own size — that is real data about the row,
      // used outside the quota — and none of it reached storage_usages.
      for (const item of items) {
        expect(Number(item.contentSize)).toBe(
          Buffer.byteLength(item.content, 'utf8'),
        );
      }
      expect(itemSize).toBeGreaterThan(0);
      expect(await contentUsage(client.namespace.id, client.user.id)).toBe(
        before,
      );
    });

    it('refunds nothing when the link is removed, and stays put on re-add', async () => {
      const before = await contentUsage(client.namespace.id, client.user.id);
      // A folder always keeps at least one link, so swap in an unrelated (and
      // empty) feed rather than emptying the list.
      feeds.set(FEED_EMPTY, []);
      await client
        .patch(
          `/api/v1/namespaces/${client.namespace.id}/rss-folders/${folderId}/config`,
        )
        .send({ links: [{ url: FEED_EMPTY }] })
        .expect(200);
      // Nothing was charged for the items, so retiring them must refund
      // nothing: a refund here would push the owner's usage below what their
      // own documents occupy, and with no items left it would go negative.
      expect(await folderItems(folderId)).toHaveLength(0);
      expect(before).toBe(docSize);
      expect(await contentUsage(client.namespace.id, client.user.id)).toBe(
        docSize,
      );

      await client
        .patch(
          `/api/v1/namespaces/${client.namespace.id}/rss-folders/${folderId}/config`,
        )
        .send({ links: [{ url: FEED_CHARGED }] })
        .expect(200);
      expect(await repoll(FEED_CHARGED)).toBe('succeed');
      expect(await folderItems(folderId)).toHaveLength(3);
      expect(await contentUsage(client.namespace.id, client.user.id)).toBe(
        before,
      );
    });

    it('charges nothing when a second folder subscribes to the same url', async () => {
      const before = await contentUsage(client.namespace.id, client.user.id);
      const secondId = (
        await createFolder(
          client,
          'Charged folder twice',
          client.namespace.root_resource_id,
          [FEED_CHARGED],
        )
      ).resource.id;
      expect(await repoll(FEED_CHARGED)).toBe('succeed');

      // The second folder gets its own copy of every article — duplication is
      // how items are stored — and the owner pays for neither set.
      const copies = await folderItems(secondId);
      expect(copies).toHaveLength(3);
      expect(copies.reduce((sum, i) => sum + Number(i.contentSize), 0)).toBe(
        itemSize,
      );
      expect(await contentUsage(client.namespace.id, client.user.id)).toBe(
        before,
      );

      await client
        .delete(
          `/api/v1/namespaces/${client.namespace.id}/rss-folders/${secondId}`,
        )
        .expect(200);
      expect(await contentUsage(client.namespace.id, client.user.id)).toBe(
        before,
      );
    });

    // The exemption is keyed on the resource type, so the regression to watch
    // for is a document in the same namespace quietly stopping to count.
    it('still charges and refunds an ordinary doc in the same namespace', async () => {
      const before = await contentUsage(client.namespace.id, client.user.id);
      const content = 'a plain document that does count';
      const size = Buffer.byteLength(content, 'utf8');
      const doc = (
        await client
          .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
          .send({
            parentId: client.namespace.root_resource_id,
            resourceType: ResourceType.DOC,
            name: 'Counted doc',
            content,
          })
          .expect(201)
      ).body as { id: string };
      expect(await contentUsage(client.namespace.id, client.user.id)).toBe(
        before + size,
      );

      const longer = content + ' — now with more bytes';
      await client
        .patch(`/api/v1/namespaces/${client.namespace.id}/resources/${doc.id}`)
        .send({ content: longer })
        .expect(200);
      expect(await contentUsage(client.namespace.id, client.user.id)).toBe(
        before + Buffer.byteLength(longer, 'utf8'),
      );

      await client
        .delete(`/api/v1/namespaces/${client.namespace.id}/resources/${doc.id}`)
        .expect(200);
      expect(await contentUsage(client.namespace.id, client.user.id)).toBe(
        before,
      );
    });

    it('leaves the usage alone when the folder is trashed and restored', async () => {
      const before = await contentUsage(client.namespace.id, client.user.id);
      const [item] = await folderItems(folderId);
      await client
        .delete(
          `/api/v1/namespaces/${client.namespace.id}/rss-folders/${folderId}`,
        )
        .expect(200);
      // Trashing a folder hides its children rather than deleting them, and
      // either way there is nothing to refund.
      expect(await contentUsage(client.namespace.id, client.user.id)).toBe(
        before,
      );
      expect(
        await resourceRepo().findOneOrFail({ where: { id: item.id } }),
      ).toMatchObject({ deletedAt: null });

      await client
        .post(
          `/api/v1/namespaces/${client.namespace.id}/resources/${folderId}/restore`,
        )
        .expect(201);
      const restored = await client
        .get(`/api/v1/namespaces/${client.namespace.id}/resources/${item.id}`)
        .expect(200);
      expect(restored.body.read_only).toBe(true);
      expect(await contentUsage(client.namespace.id, client.user.id)).toBe(
        before,
      );
    });

    it('leaves no item with a dangling parent after the folder is purged', async () => {
      await client
        .delete(
          `/api/v1/namespaces/${client.namespace.id}/rss-folders/${folderId}`,
        )
        .expect(200);
      await client
        .delete(
          `/api/v1/namespaces/${client.namespace.id}/resources/trash/${folderId}`,
        )
        .expect(200);

      const folder = await resourceRepo().findOne({
        where: { id: folderId },
        withDeleted: true,
      });
      expect(folder?.permanentDeletedAt).not.toBeNull();
      // Items are still parented to the purged folder rather than orphaned to
      // the root; they become unreachable with it.
      const items = await folderItems(folderId, true);
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        expect(item.parentId).toBe(folderId);
      }
      expect(
        await client
          .get(
            `/api/v1/namespaces/${client.namespace.id}/resources/${items[0].id}`,
          )
          .expect(404),
      ).toBeDefined();
      expect(itemId).toBeTruthy();
    });
  });

  // A feed folder is read a page at a time, and each row shows a prefix of the
  // parsed article rather than the whole thing, so the page and the content on
  // it are read separately. These cases pin what that produces at the window
  // boundaries: the pages must tile the newest-first listing exactly once, and
  // every row must still be wearing its own article.
  describe('paging a feed folder', () => {
    const FEED_PAGED = 'https://example.com/lifecycle-paged';
    const ITEM_COUNT = 12;
    const PAGE_SIZE = 5;
    let folderId: string;

    // Published a day apart so the newest-first order is unambiguous, and
    // titled in publish order so a page can be checked by name alone.
    const itemUrl = (index: number) =>
      `https://example.com/paged-${String(index).padStart(2, '0')}`;
    const itemTitle = (index: number) =>
      `Paged item ${String(index).padStart(2, '0')}`;

    beforeAll(async () => {
      feeds.set(
        FEED_PAGED,
        Array.from({ length: ITEM_COUNT }, (_unused, index) => ({
          title: itemTitle(index),
          link: itemUrl(index),
          guid: `paged-${index}`,
          description: `body ${index}`,
          pubDate: `Mon, ${String(index + 1).padStart(2, '0')} Jun 2026 00:00:00 GMT`,
        })),
      );
      folderId = (
        await createFolder(
          client,
          'Paged feed',
          client.namespace.root_resource_id,
          [FEED_PAGED],
        )
      ).resource.id;
      await repoll(FEED_PAGED);
      expect(await folderItems(folderId)).toHaveLength(ITEM_COUNT);
    });

    const listPage = async (query: string) =>
      (
        await client
          .get(
            `/api/v1/namespaces/${client.namespace.id}/resources/${folderId}/children?${query}`,
          )
          .expect(200)
      ).body as Array<{ id: string; name: string; content: string }>;

    it('tiles the newest-first listing exactly once', async () => {
      const unpaged = await listPage(
        'summary=true&sort_by=created_at&sort_order=desc',
      );
      expect(unpaged.map((item) => item.name)).toEqual(
        Array.from({ length: ITEM_COUNT }, (_unused, index) =>
          itemTitle(ITEM_COUNT - 1 - index),
        ),
      );

      const paged: typeof unpaged = [];
      for (
        let offset = 0;
        offset < ITEM_COUNT + PAGE_SIZE;
        offset += PAGE_SIZE
      ) {
        const page = await listPage(
          `summary=true&limit=${PAGE_SIZE}&offset=${offset}&sort_by=created_at&sort_order=desc`,
        );
        expect(page).toHaveLength(
          Math.min(PAGE_SIZE, Math.max(0, ITEM_COUNT - offset)),
        );
        paged.push(...page);
      }
      expect(paged.map((item) => item.id)).toEqual(
        unpaged.map((item) => item.id),
      );
    });

    it('keeps each row with its own article on every page', async () => {
      for (let offset = 0; offset < ITEM_COUNT; offset += PAGE_SIZE) {
        const page = await listPage(
          `summary=true&limit=${PAGE_SIZE}&offset=${offset}&sort_by=created_at&sort_order=desc`,
        );
        for (const [position, item] of page.entries()) {
          const index = ITEM_COUNT - 1 - (offset + position);
          expect(item.name).toBe(itemTitle(index));
          // The parse stub writes the article url into the markdown, so the
          // summary shows which article this row actually carries.
          expect(item.content).toBe(`# ${itemUrl(index)}`);
        }
      }
    });

    it('counts the whole feed at every window', async () => {
      for (const offset of [0, 5, 10, ITEM_COUNT, 500]) {
        const response = await client
          .request()
          .get(
            `/internal/api/v1/namespaces/${client.namespace.id}/resources/${folderId}/list?limit=${PAGE_SIZE}&offset=${offset}`,
          )
          .set('x-user-id', client.user.id)
          .expect(200);
        expect(response.body.total).toBe(ITEM_COUNT);
        expect(response.body.resources).toHaveLength(
          Math.min(PAGE_SIZE, Math.max(0, ITEM_COUNT - offset)),
        );
      }
    });
  });

  describe('concurrency', () => {
    const FEED_RACE = 'https://example.com/lifecycle-race';
    const FEED_LOSER = 'https://example.com/lifecycle-loser';
    const FEED_WRAPPED = 'https://example.com/lifecycle-wrapped';
    const FEED_OTHER_UNIQUE = 'https://example.com/lifecycle-other-unique';
    const FEED_ORPHAN = 'https://example.com/lifecycle-orphan';
    const FEED_ORPHAN_KEEP = 'https://example.com/lifecycle-orphan-keep';
    const FEED_ORPHAN_FOLDER = 'https://example.com/lifecycle-orphan-folder';
    const FEED_HELD = 'https://example.com/lifecycle-held';
    const FEED_HELD_KEEP = 'https://example.com/lifecycle-held-keep';
    const FEED_RENAMED = 'https://example.com/lifecycle-renamed';
    const FEED_RENAMED_KEEP = 'https://example.com/lifecycle-renamed-keep';

    // Runs `interfere` in the window linkItems leaves open: its links, folders
    // and existing-copy reads have all happened and the insert has not opened
    // its transaction yet. A config change or a folder deletion landing here is
    // the whole reason the insert re-checks the subscription.
    const interfereBeforeInsert = (interfere: () => Promise<void>) => {
      const poller = pollingService as unknown as Record<
        'insertItemResource',
        (...args: unknown[]) => Promise<void>
      >;
      const realInsert = poller.insertItemResource.bind(pollingService);
      return jest
        .spyOn(poller, 'insertItemResource')
        .mockImplementationOnce(async (...args: unknown[]) => {
          await interfere();
          return await realInsert(...args);
        });
    };

    // The other half of the same race, and the half the re-check cannot cover:
    // `interfere` is started *inside* the insert's transaction, right after
    // subscriptionIsLive has taken its FOR SHARE on the link row, so the
    // re-check has already said yes and only the lock pairing decides the
    // outcome. The request is fired without awaiting — awaiting it here would
    // hang, since the fix is precisely that it blocks — and the insert resumes
    // once it has either settled (nothing held it up, which is the bug) or
    // parked on the link row. The caller awaits it after the poll.
    const interfereInsideInsert = (interfere: () => Promise<unknown>) => {
      let interfering: Promise<unknown> = Promise.resolve();
      const poller = pollingService as unknown as Record<
        'subscriptionIsLive',
        (...args: unknown[]) => Promise<boolean>
      >;
      const realCheck = poller.subscriptionIsLive.bind(pollingService);
      const spy = jest
        .spyOn(poller, 'subscriptionIsLive')
        .mockImplementationOnce(async (...args: unknown[]) => {
          const live = await realCheck(...args);
          interfering = interfere();
          // Handled here so an assertion failure inside the request surfaces
          // when the caller awaits it rather than as an unhandled rejection.
          const done = interfering.then(
            () => true,
            () => true,
          );
          await Promise.race([done, waitForLinkLockWaiter()]);
          return live;
        });
      return {
        restore: () => spy.mockRestore(),
        settled: () => interfering,
      };
    };

    // Resolves as soon as some backend is parked on a lock inside removeLink's
    // `FOR UPDATE`, and gives up after a bound so a run where that never
    // happens still finishes (it is raced against the request settling).
    const waitForLinkLockWaiter = async () => {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const rows: Array<{ waiting: string }> = await dataSource.query(
          `SELECT count(*) AS waiting FROM pg_stat_activity
            WHERE wait_event_type = 'Lock'
              AND query LIKE '%FROM rss_links WHERE id = $1 FOR UPDATE%'`,
        );
        if (Number(rows[0].waiting) > 0) {
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    };

    // Commits the copy a rival poll would have created, on its own connection,
    // so the create running inside the poller's transaction really collides
    // with the (link_id, guid) identity index.
    const insertRivalItemCopy = async (props: {
      namespaceId: string;
      parentId: string | null;
      userId: string | null;
      name?: string;
      attrs?: Record<string, any>;
    }) => {
      await dataSource.query(
        `INSERT INTO resources (id, namespace_id, user_id, parent_id, resource_type, name, content, attrs)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          `rival${Date.now().toString(36)}`.slice(0, 16),
          props.namespaceId,
          props.userId,
          props.parentId,
          ResourceType.RSS_ITEM,
          props.name ?? '',
          '',
          JSON.stringify(props.attrs ?? {}),
        ],
      );
    };

    // A unique violation in the shape the driver hands up: the pg error carries
    // the code and the constraint, and TypeORM wraps it. Nothing is copied onto
    // the wrapper, so a predicate reading only the top-level `code` sees
    // nothing at all.
    const wrappedUniqueViolation = (constraint: string) => {
      const driverError = new Error(
        `duplicate key value violates unique constraint "${constraint}"`,
      );
      Object.defineProperties(driverError, {
        code: { value: '23505', enumerable: false },
        constraint: { value: constraint, enumerable: false },
      });
      return new QueryFailedError(
        'INSERT INTO "resources" ...',
        [],
        driverError,
      );
    };

    it('drops a copy another poll already created instead of failing the poll', async () => {
      // Overlapping polls are prevented by the POLLING marker, but that lock
      // expires (stale recovery), so the (link, guid) unique index is the real
      // guarantee. A losing insert must not take the whole poll down with it.
      feeds.set(FEED_LOSER, [
        {
          title: 'Lost race',
          link: 'https://example.com/lost',
          guid: 'lost',
          description: 'lost body',
        },
        {
          title: 'Won race',
          link: 'https://example.com/won',
          guid: 'won',
          description: 'won body',
        },
      ]);
      const folderId = (
        await createFolder(
          otherClient,
          'Losing folder',
          await privateRootId(otherClient),
          [FEED_LOSER],
        )
      ).resource.id;

      // The losing insert is not simulated: the first item's create is made to
      // race for real. The mock lets a "concurrent poll" commit the identical
      // copy on another connection and then calls the real create, which hits
      // the identity index and fails exactly as it would in production.
      const resourcesService = client.app.get(ResourcesService);
      const realCreateResource = resourcesService.createResource.bind(
        resourcesService,
      ) as typeof resourcesService.createResource;
      let raced: unknown;
      const createSpy = jest
        .spyOn(resourcesService, 'createResource')
        .mockImplementationOnce(async (props, tx, autoRename, options) => {
          await insertRivalItemCopy(props);
          try {
            return await realCreateResource(props, tx, autoRename, options);
          } catch (err) {
            raced = err;
            throw err;
          }
        });
      try {
        expect(await repoll(FEED_LOSER)).toBe('succeed');
      } finally {
        createSpy.mockRestore();
      }

      // The insert really did fail on the identity index, wrapped by the
      // driver: the poller must recognise it in that shape, not only as a bare
      // `code` on the thrown error.
      expect(raced).toBeInstanceOf(QueryFailedError);
      expect((raced as QueryFailedError).driverError).toMatchObject({
        code: '23505',
        constraint: 'uq_resources_rss_item_identity',
      });

      // The copy the poll lost is the rival's, so the folder holds one of each
      // item and the poll as a whole still succeeded.
      expect(
        (await folderItems(folderId)).map((item) => item.name).sort(),
      ).toEqual(['Lost race', 'Won race']);
      expect(await repoll(FEED_LOSER)).toBe('succeed');
      expect(
        (await folderItems(folderId)).map((item) => item.name).sort(),
      ).toEqual(['Lost race', 'Won race']);
    });

    it('recognises the violation when only the wrapped driver error carries it', async () => {
      // Same failure, minus the properties TypeORM happens to copy onto the
      // wrapper: a predicate that only reads the top-level `code` would treat
      // this as a real failure and take the poll down.
      feeds.set(FEED_WRAPPED, [
        {
          title: 'Wrapped',
          link: 'https://example.com/wrapped',
          guid: 'wrapped',
          description: 'wrapped body',
        },
      ]);
      const folderId = (
        await createFolder(
          otherClient,
          'Wrapped folder',
          await privateRootId(otherClient),
          [FEED_WRAPPED],
        )
      ).resource.id;

      const resourcesService = client.app.get(ResourcesService);
      const createSpy = jest
        .spyOn(resourcesService, 'createResource')
        .mockImplementationOnce(() =>
          Promise.reject(
            wrappedUniqueViolation('uq_resources_rss_item_identity'),
          ),
        );
      try {
        expect(await repoll(FEED_WRAPPED)).toBe('succeed');
      } finally {
        createSpy.mockRestore();
      }
      expect(await folderItems(folderId)).toHaveLength(0);
    });

    it('fails the poll on a unique violation that is not the item identity', async () => {
      // Only the item identity index may be swallowed. A unique violation from
      // any other index — here storage_usages', which an item insert no longer
      // touches but some other row it writes might — would silently drop the
      // item, so it must fail the poll instead.
      feeds.set(FEED_OTHER_UNIQUE, [
        {
          title: 'Other unique',
          link: 'https://example.com/other-unique',
          guid: 'other-unique',
          description: 'other unique body',
        },
      ]);
      const folderId = (
        await createFolder(
          otherClient,
          'Other unique folder',
          await privateRootId(otherClient),
          [FEED_OTHER_UNIQUE],
        )
      ).resource.id;

      const resourcesService = client.app.get(ResourcesService);
      const createSpy = jest
        .spyOn(resourcesService, 'createResource')
        .mockImplementationOnce(() =>
          Promise.reject(
            wrappedUniqueViolation('UQ_storage_usages_namespace_user_type'),
          ),
        );
      try {
        expect(await repoll(FEED_OTHER_UNIQUE)).toBe('failed');
      } finally {
        createSpy.mockRestore();
      }
      expect(await folderItems(folderId)).toHaveLength(0);

      // Nothing was lost: the next poll creates the item as usual.
      expect(await repoll(FEED_OTHER_UNIQUE)).toBe('succeed');
      expect(await folderItems(folderId)).toHaveLength(1);
    });

    it('holds the (link, guid) identity under two concurrent polls', async () => {
      feeds.set(FEED_RACE, [
        {
          title: 'Raced',
          link: 'https://example.com/raced',
          guid: 'raced',
          description: 'raced body',
        },
      ]);
      const folderId = (
        await createFolder(
          otherClient,
          'Raced folder',
          otherClient.namespace.root_resource_id,
          [FEED_RACE],
        )
      ).resource.id;

      await pollRepo().delete({ url: FEED_RACE });
      const results = await Promise.all([
        pollingService.pollUrl(FEED_RACE),
        pollingService.pollUrl(FEED_RACE),
      ]);
      // Exactly one worker claims the url; the other backs off.
      expect(results.filter((result) => result === 'succeed')).toHaveLength(1);
      expect(results.filter((result) => result === 'skipped')).toHaveLength(1);
      expect(await folderItems(folderId, true)).toHaveLength(1);
      expect(await contentRepo().count({ where: { url: FEED_RACE } })).toBe(1);
    });

    it('skips an item whose link was retired mid-poll', async () => {
      feeds.set(FEED_ORPHAN, [
        {
          title: 'Orphan',
          link: 'https://example.com/orphan',
          guid: 'orphan',
          description: 'orphan body',
        },
      ]);
      feeds.set(FEED_ORPHAN_KEEP, []);
      const created = await createFolder(
        client,
        'Orphan folder',
        await privateRootId(client),
        [FEED_ORPHAN, FEED_ORPHAN_KEEP],
      );
      const folderId = created.resource.id;
      const orphanLinkId = created.links.find(
        (link) => link.url === FEED_ORPHAN,
      )!.id;

      // The user drops the url while the poll is between its reads and its
      // insert: the removal trashes the link's items (there are none yet) and
      // retires the link, and both commit before the item is created.
      const spy = interfereBeforeInsert(async () => {
        await client
          .patch(
            `/api/v1/namespaces/${client.namespace.id}/rss-folders/${folderId}/config`,
          )
          .send({ links: [{ url: FEED_ORPHAN_KEEP }] })
          .expect(200);
      });
      const logged = captureLogs();
      try {
        expect(await repoll(FEED_ORPHAN)).toBe('succeed');
      } finally {
        spy.mockRestore();
        logged.restore();
      }

      // The interleaving really happened.
      const link = await linkRepo().findOne({
        where: { id: orphanLinkId },
        withDeleted: true,
      });
      expect(link?.deletedAt).not.toBeNull();
      // And the poll left nothing behind. A copy created here would be live
      // under a retired link: the removal has already run, no later config
      // update revisits a soft-deleted link, and the parse fan-out only
      // refreshes copies of live links — so the folder would list that article,
      // with no link name and charged to its owner, until the folder itself is
      // deleted.
      expect(await folderItems(folderId, true)).toHaveLength(0);
      expect(logged.matching(/subscription went away/)).toHaveLength(1);
      const listed = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/rss-folders/${folderId}/items`,
        )
        .expect(200);
      expect(listed.body).toEqual([]);
    });

    it('skips an item whose folder was deleted mid-poll', async () => {
      feeds.set(FEED_ORPHAN_FOLDER, [
        {
          title: 'Doomed',
          link: 'https://example.com/doomed',
          guid: 'doomed',
          description: 'doomed body',
        },
      ]);
      const folderId = (
        await createFolder(
          client,
          'Doomed folder',
          await privateRootId(client),
          [FEED_ORPHAN_FOLDER],
        )
      ).resource.id;

      // Same window, the other end of the subscription: the folder the item
      // would hang off is trashed before the insert opens its transaction.
      const spy = interfereBeforeInsert(async () => {
        await client
          .delete(
            `/api/v1/namespaces/${client.namespace.id}/rss-folders/${folderId}`,
          )
          .expect(200);
      });
      try {
        expect(await repoll(FEED_ORPHAN_FOLDER)).toBe('succeed');
      } finally {
        spy.mockRestore();
      }

      const folder = await resourceRepo().findOne({
        where: { id: folderId },
        withDeleted: true,
      });
      expect(folder?.deletedAt).not.toBeNull();
      expect(await folderItems(folderId, true)).toHaveLength(0);
    });

    // The two cases above only ever reach the re-check: their interference is
    // over before the insert's transaction opens. This one starts the removal
    // after the re-check has passed, which is the only interleaving the row
    // locks exist for — with them gone (and the re-check left in place) the
    // removal runs to completion while the insert is still open, and the copy
    // it could not see stays live under a link that no longer exists.
    it('retires a copy the removal could only see because it waited for the insert', async () => {
      feeds.set(FEED_HELD, [
        {
          title: 'Held',
          link: 'https://example.com/held',
          guid: 'held',
          description: 'held body',
        },
      ]);
      feeds.set(FEED_HELD_KEEP, []);
      const created = await createFolder(
        client,
        'Held folder',
        await privateRootId(client),
        [FEED_HELD, FEED_HELD_KEEP],
      );
      const folderId = created.resource.id;
      const heldLinkId = created.links.find(
        (link) => link.url === FEED_HELD,
      )!.id;

      const interference = interfereInsideInsert(() =>
        client
          .patch(
            `/api/v1/namespaces/${client.namespace.id}/rss-folders/${folderId}/config`,
          )
          .send({ links: [{ url: FEED_HELD_KEEP }] })
          .expect(200),
      );
      try {
        expect(await repoll(FEED_HELD)).toBe('succeed');
        await interference.settled();
      } finally {
        interference.restore();
      }

      const link = await linkRepo().findOne({
        where: { id: heldLinkId },
        withDeleted: true,
      });
      expect(link?.deletedAt).not.toBeNull();
      // The insert won the race — it held the link row, so the removal could
      // not collect the items to trash until it had committed...
      const all = await folderItems(folderId, true);
      expect(all).toHaveLength(1);
      expect(all[0].attrs.link_id).toBe(heldLinkId);
      // ...and having waited, the removal saw the copy and took it with the
      // link. Nothing live is left hanging off a retired subscription.
      expect(all[0].deletedAt).not.toBeNull();
      expect(await folderItems(folderId)).toHaveLength(0);
    });

    // Same interleaving, with the payload the web actually sends: every config
    // save PATCHes name and links together. The rename locks the folder
    // resource row and the removal locks the link row, and the insert holds the
    // link row while the resources.parent_id self-FK makes it take the folder
    // row — so the two must acquire in the same order or Postgres kills one of
    // them. It kills the user's request: renaming before reconciling turns this
    // case into a 500 and a lost config change.
    it('renames and drops a url in one request while a poll holds the link', async () => {
      feeds.set(FEED_RENAMED, [
        {
          title: 'Renamed',
          link: 'https://example.com/renamed',
          guid: 'renamed',
          description: 'renamed body',
        },
      ]);
      feeds.set(FEED_RENAMED_KEEP, []);
      const created = await createFolder(
        client,
        'Renamed folder',
        await privateRootId(client),
        [FEED_RENAMED, FEED_RENAMED_KEEP],
      );
      const folderId = created.resource.id;

      const interference = interfereInsideInsert(() =>
        client
          .patch(
            `/api/v1/namespaces/${client.namespace.id}/rss-folders/${folderId}/config`,
          )
          .send({
            name: 'Renamed folder v2',
            links: [{ url: FEED_RENAMED_KEEP }],
          })
          .expect(200),
      );
      try {
        expect(await repoll(FEED_RENAMED)).toBe('succeed');
        await interference.settled();
      } finally {
        interference.restore();
      }

      // Neither side was rolled back: the save applied in full and the poll
      // reported success.
      const config = (
        await client
          .get(
            `/api/v1/namespaces/${client.namespace.id}/rss-folders/${folderId}/config`,
          )
          .expect(200)
      ).body;
      expect(config.resource.name).toBe('Renamed folder v2');
      expect(config.links).toHaveLength(1);
      expect(config.links[0].url).toBe(FEED_RENAMED_KEEP);
      expect(await folderItems(folderId)).toHaveLength(0);
    });
  });

  // The migration chain runs against a fresh database for every e2e run, so
  // these read back what it actually produced rather than what it says.
  describe('schema the migration leaves behind', () => {
    it('keeps the legacy rss_items table instead of dropping it', async () => {
      // Retained but unused: item identity lives in resources.attrs now, yet
      // the old rows are the only record of the pre-resource era.
      const rows: Array<{ present: boolean }> = await dataSource.query(
        `SELECT to_regclass('public.rss_items') IS NOT NULL AS present`,
      );
      expect(rows[0].present).toBe(true);
    });

    it('scopes the item identity index to live rows', async () => {
      const rows: Array<{ indexdef: string }> = await dataSource.query(
        `SELECT indexdef FROM pg_indexes
          WHERE schemaname = 'public'
            AND indexname = 'uq_resources_rss_item_identity'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].indexdef).toContain("resource_type = 'rss_item'");
      // Without this a retired copy would keep its (link_id, guid) reserved
      // forever, so a re-subscribed folder could never get the article back.
      expect(rows[0].indexdef).toContain('deleted_at IS NULL');
    });
  });

  // Items go with their subscription or with their folder; a user never
  // deletes one on its own. The narrowed identity index makes retired copies
  // ordinary history, which must not turn them into something the user can act
  // on.
  describe('an item is never the user’s to delete', () => {
    const FEED_LOCKED = 'https://example.com/lifecycle-locked';
    let folderId: string;
    let itemId: string;
    let base: string;

    beforeAll(async () => {
      feeds.set(FEED_LOCKED, [
        {
          title: 'Locked',
          link: 'https://example.com/locked',
          guid: 'locked',
          description: 'locked body',
        },
      ]);
      folderId = (
        await createFolder(
          client,
          'Locked folder',
          await privateRootId(client),
          [FEED_LOCKED],
        )
      ).resource.id;
      expect(await repoll(FEED_LOCKED)).toBe('succeed');
      const items = await folderItems(folderId);
      expect(items).toHaveLength(1);
      itemId = items[0].id;
      base = `/api/v1/namespaces/${client.namespace.id}/resources`;
    });

    it('refuses to trash a live item and leaves it in the folder', async () => {
      const rejected = await client
        .delete(`${base}/${itemId}`)
        .expect(HttpStatus.FORBIDDEN);
      expect(rejected.body.code).toBe('resource_read_only');
      expect((await folderItems(folderId)).map((item) => item.id)).toEqual([
        itemId,
      ]);
    });

    it('hides a retired item from the trash and refuses to purge it', async () => {
      // Dropping the link is the only user-facing way to retire an item.
      feeds.set(FEED_EMPTY, []);
      await client
        .patch(
          `/api/v1/namespaces/${client.namespace.id}/rss-folders/${folderId}/config`,
        )
        .send({ links: [{ url: FEED_EMPTY }] })
        .expect(200);
      const retired = await resourceRepo().findOneOrFail({
        where: { id: itemId },
        withDeleted: true,
      });
      expect(retired.deletedAt).not.toBeNull();

      const trash = await client.get(`${base}/trash?limit=100`).expect(200);
      expect(
        (trash.body.items as Array<{ id: string }>).map((entry) => entry.id),
      ).not.toContain(itemId);

      const purged = await client
        .delete(`${base}/trash/${itemId}`)
        .expect(HttpStatus.FORBIDDEN);
      expect(purged.body.code).toBe('resource_read_only');

      // Emptying the trash reaches only what the trash listed.
      await client.delete(`${base}/trash`).expect(200);
      const afterEmpty = await resourceRepo().findOneOrFail({
        where: { id: itemId },
        withDeleted: true,
      });
      expect(afterEmpty.permanentDeletedAt).toBeNull();
      expect(afterEmpty.deletedAt).not.toBeNull();
    });

    it('takes the folder’s items out of reach when the folder is deleted', async () => {
      // Re-subscribe so the folder holds a live item again, then delete the
      // folder: that is the one action that does remove a user's items.
      await client
        .patch(
          `/api/v1/namespaces/${client.namespace.id}/rss-folders/${folderId}/config`,
        )
        .send({ links: [{ url: FEED_LOCKED }] })
        .expect(200);
      expect(await repoll(FEED_LOCKED)).toBe('succeed');
      const [live] = await folderItems(folderId);
      expect(live).toBeDefined();
      await client.get(`${base}/${live.id}`).expect(200);

      await client
        .delete(
          `/api/v1/namespaces/${client.namespace.id}/rss-folders/${folderId}`,
        )
        .expect(200);

      await client.get(`${base}/${live.id}`).expect(HttpStatus.NOT_FOUND);
      // ... and a poll of the url no longer materializes anything for it.
      expect(await repoll(FEED_LOCKED)).toBe('succeed');
      expect(await folderItems(folderId, true)).toHaveLength(2);
    });
  });

  // An article is a resource like any other: findable by the words in its body
  // and collectable by a smart folder. Only the paths that mean "recent work"
  // still leave items out, so a busy feed cannot flood them.
  describe('search and smart folders', () => {
    const FEED_SEARCHABLE = 'https://example.com/lifecycle-searchable';
    // The slug lands in the parsed markdown, never in the item title, so a hit
    // on it can only have come from the body.
    const ARTICLE_SLUG = 'synthesizer-latency-budget';
    const ARTICLE_URL = `https://example.com/${ARTICLE_SLUG}`;
    let folderId: string;
    let itemId: string;
    let smartFolderId: string;

    beforeAll(async () => {
      feeds.set(FEED_SEARCHABLE, [
        {
          title: 'Discoverable digest',
          link: ARTICLE_URL,
          guid: 'searchable-1',
          description: 'summary line',
          pubDate: 'Mon, 09 Feb 2026 00:00:00 GMT',
        },
      ]);
      folderId = (
        await createFolder(
          client,
          'Discoverable Feed',
          await privateRootId(client),
          [FEED_SEARCHABLE],
        )
      ).resource.id;
      expect(await repoll(FEED_SEARCHABLE)).toBe('succeed');
      const items = await folderItems(folderId);
      expect(items).toHaveLength(1);
      itemId = items[0].id;
      // The copy is created from the parsed article; the slug is only in there.
      expect(items[0].content).toContain(ARTICLE_SLUG);
      expect(items[0].name).not.toContain(ARTICLE_SLUG);

      smartFolderId = (
        await client
          .post(`/api/v1/namespaces/${client.namespace.id}/smart-folders`)
          .send({
            name: 'Digest rule',
            parent_id: await privateRootId(client),
            root_scope: 'private',
            // One rule reaches the article by its body and the other reaches
            // the feed folder by its name; the basic tier allows one smart
            // folder per space, so both live on this one.
            match_mode: 'any',
            conditions: [
              { field: 'content', operator: 'contains', value: ARTICLE_SLUG },
              {
                field: 'title',
                operator: 'contains',
                value: 'Discoverable Feed',
              },
            ],
          })
          .expect(201)
      ).body.resource.id;
    });

    afterAll(async () => {
      await client
        .delete(
          `/api/v1/namespaces/${client.namespace.id}/smart-folders/${smartFolderId}`,
        )
        .expect(200);
      await client
        .delete(
          `/api/v1/namespaces/${client.namespace.id}/rss-folders/${folderId}`,
        )
        .expect(200);
    });

    it('returns an rss item from a filtered search on its body text', async () => {
      const found = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/search`)
        .send({
          conditions: [
            { field: 'content', operator: 'contains', value: ARTICLE_SLUG },
          ],
          match_mode: 'all',
          limit: 50,
        })
        .expect(201);

      const hits = found.body.items as Array<{
        resource_id: string;
        resource_type: string;
        read_only: boolean;
      }>;
      const hit = hits.find((entry) => entry.resource_id === itemId);
      expect(hit).toBeDefined();
      expect(hit!.resource_type).toBe(ResourceType.RSS_ITEM);
      // Findable, but still not editable.
      expect(hit!.read_only).toBe(true);
    });

    it('collects a matching article into a smart folder', async () => {
      const children = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/smart-folders/${smartFolderId}/children?limit=100`,
        )
        .expect(200);
      expect(
        (children.body as Array<{ id: string }>).map((child) => child.id),
      ).toContain(itemId);
    });

    it('collects the containing rss folder when a rule names it', async () => {
      const children = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/smart-folders/${smartFolderId}/children?limit=100`,
        )
        .expect(200);
      // An rss folder is a container like any other folder, so nothing keeps it
      // out of a rule that matches it.
      expect(
        (children.body as Array<{ id: string }>).map((child) => child.id),
      ).toContain(folderId);
    });

    it('still keeps rss items out of the recent listing', async () => {
      const recent = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/recent?limit=100`,
        )
        .expect(200);
      const recentIds = (recent.body as Array<{ id: string }>).map(
        (entry) => entry.id,
      );
      expect(recentIds).not.toContain(itemId);
      expect(recentIds).not.toContain(folderId);
    });

    it('still refuses an rss folder created through the generic endpoint', async () => {
      const rejected = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .send({
          name: 'Hand-rolled feed',
          resourceType: ResourceType.RSS_FOLDER,
          parentId: await privateRootId(client),
          content: '',
        })
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(rejected.body.code).toBe('resource_type_not_directly_creatable');
    });

    // Becoming findable does not make a feed folder a destination: the move
    // picker's own listing is a different gate and still leaves it out.
    it('still refuses an rss folder as a move target', async () => {
      const doc = (
        await client
          .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
          .send({
            name: 'Movable doc',
            resourceType: ResourceType.DOC,
            parentId: await privateRootId(client),
            content: 'body',
          })
          .expect(201)
      ).body as { id: string };

      // The picker never lists the folder ...
      const destinations = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/search?name=Discoverable`,
        )
        .expect(200);
      expect(
        (destinations.body as Array<{ id: string }>).map((entry) => entry.id),
      ).not.toContain(folderId);

      // ... and the move itself is refused.
      const moved = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources/batch-move`)
        .send({ resourceIds: [doc.id], targetId: folderId })
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(moved.body.code).toBe('rss_folder_child_must_be_rss_item');

      await client
        .delete(`/api/v1/namespaces/${client.namespace.id}/resources/${doc.id}`)
        .expect(200);
    });
  });
});
