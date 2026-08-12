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

    it('re-adding a removed url gives the folder fresh copies, not duplicates', async () => {
      const updated = await client
        .patch(
          `/api/v1/namespaces/${client.namespace.id}/rss-folders/${folderId}/config`,
        )
        .send({ links: [{ url: FEED_B }, { url: FEED_A }] })
        .expect(200);
      const newLinkId = (
        updated.body.links as Array<{ id: string; url: string }>
      ).find((link) => link.url === FEED_A)!.id;

      expect(await repoll(FEED_A)).toBe('succeed');

      const live = await folderItems(folderId);
      expect(live.map((item) => item.name).sort()).toEqual([
        'A newer',
        'A older',
        'B middle',
      ]);
      // The resurrected items belong to the new link, and each (link, guid)
      // pair still appears exactly once.
      for (const item of live.filter((item) => item.name.startsWith('A '))) {
        expect(item.attrs.link_id).toBe(newLinkId);
      }
      const identities = (await folderItems(folderId, true)).map(
        (item) => `${item.attrs.link_id}:${item.attrs.guid}`,
      );
      expect(new Set(identities).size).toBe(identities.length);
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

    it('fans a changed body out to every copy and re-emits an index task', async () => {
      const taskCountFor = async (resourceId: string) => {
        const rows: Array<{ count: string }> = await dataSource.query(
          `SELECT count(*) FROM tasks WHERE resource_id = $1 AND function = 'upsert_index'`,
          [resourceId],
        );
        return Number(rows[0].count);
      };
      const [here] = await folderItems(firstFolderId);
      const [there] = await folderItems(secondFolderId);
      const tasksBefore = await taskCountFor(here.id);
      const usageBefore = await contentUsage(
        client.namespace.id,
        client.user.id,
      );

      feeds.set(FEED_SHARED, [
        {
          title: 'Shared one',
          link: 'https://example.com/shared-1-v2',
          guid: 'shared-1',
          description: 'shared one, revised',
        },
      ]);
      parseSpy.mockClear();
      expect(await repoll(FEED_SHARED)).toBe('succeed');
      expect(parseSpy).toHaveBeenCalledTimes(1);

      const markdown = '# https://example.com/shared-1-v2';
      for (const copy of [
        (await folderItems(firstFolderId))[0],
        (await folderItems(secondFolderId))[0],
      ]) {
        expect(copy.content).toBe(markdown);
        expect(Number(copy.contentSize)).toBe(
          Buffer.byteLength(markdown, 'utf8'),
        );
      }
      expect(await taskCountFor(here.id)).toBe(tasksBefore + 1);
      // Usage follows the new body exactly, for each owner separately.
      expect(await contentUsage(client.namespace.id, client.user.id)).toBe(
        usageBefore +
          Buffer.byteLength(markdown, 'utf8') -
          Number(here.contentSize),
      );
      expect(there.content).not.toBe(markdown); // stale in-memory copy only
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

    it('follows a corrected feed title on the copy it already has', async () => {
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
      // Renamed in place: identity is the guid, so no second copy appears.
      expect(after.id).toBe(before.id);
      expect(after.name).toBe('Typo in the headline');
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

  describe('storage accounting', () => {
    let folderId: string;
    let itemId: string;
    let itemSize: number;

    it('charges the folder owner for each item body', async () => {
      feeds.set(FEED_CHARGED, [
        {
          title: 'Charged',
          link: 'https://example.com/charged',
          guid: 'charged',
          description: 'charged body',
        },
      ]);
      const before = await contentUsage(client.namespace.id, client.user.id);
      folderId = (
        await createFolder(
          client,
          'Charged folder',
          client.namespace.root_resource_id,
          [FEED_CHARGED],
        )
      ).resource.id;
      expect(await repoll(FEED_CHARGED)).toBe('succeed');

      const [item] = await folderItems(folderId);
      itemId = item.id;
      itemSize = Number(item.contentSize);
      expect(itemSize).toBe(Buffer.byteLength(item.content, 'utf8'));
      expect(await contentUsage(client.namespace.id, client.user.id)).toBe(
        before + itemSize,
      );
    });

    it('releases the usage when the link is removed and re-charges on re-add', async () => {
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
      expect(await contentUsage(client.namespace.id, client.user.id)).toBe(
        before - itemSize,
      );

      await client
        .patch(
          `/api/v1/namespaces/${client.namespace.id}/rss-folders/${folderId}/config`,
        )
        .send({ links: [{ url: FEED_CHARGED }] })
        .expect(200);
      expect(await repoll(FEED_CHARGED)).toBe('succeed');
      expect(await contentUsage(client.namespace.id, client.user.id)).toBe(
        before,
      );
    });

    it('keeps the items (and their usage) when the folder is trashed and restored', async () => {
      const before = await contentUsage(client.namespace.id, client.user.id);
      const [item] = await folderItems(folderId);
      await client
        .delete(
          `/api/v1/namespaces/${client.namespace.id}/rss-folders/${folderId}`,
        )
        .expect(200);
      // Trashing a folder hides its children rather than deleting them, so the
      // owner is still charged for them — the same as for a normal folder.
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

  describe('concurrency', () => {
    const FEED_RACE = 'https://example.com/lifecycle-race';
    const FEED_LOSER = 'https://example.com/lifecycle-loser';
    const FEED_WRAPPED = 'https://example.com/lifecycle-wrapped';
    const FEED_OTHER_UNIQUE = 'https://example.com/lifecycle-other-unique';

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
      // Creating an item also writes the owner's storage usage row, whose own
      // unique index two concurrent polls of different urls can collide on.
      // Swallowing that would silently drop the item; it must fail the poll.
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
  });
});
