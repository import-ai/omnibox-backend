import { HttpStatus } from '@nestjs/common';
import { RssItem } from 'omniboxd/rss/entities/rss-item.entity';
import { RssItemContent } from 'omniboxd/rss/entities/rss-item-content.entity';
import { RssLink } from 'omniboxd/rss/entities/rss-link.entity';
import { TestClient } from 'test/test-client';
import { DataSource, EntityManager } from 'typeorm';

const RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Example RSS Feed</title>
    <link>https://example.com</link>
    <description>Example</description>
  </channel>
</rss>`;

const HTML_BODY = '<!doctype html><html><body>not a feed</body></html>';

// Feed URLs containing 'invalid' return HTML; everything else looks like RSS.
global.fetch = jest.fn().mockImplementation((url) => {
  const body = String(url).includes('invalid') ? HTML_BODY : RSS_XML;
  return Promise.resolve({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(body),
  });
}) as jest.MockedFunction<typeof fetch>;

describe('RssFoldersController (e2e)', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = await TestClient.create();
  });

  afterAll(async () => {
    await client.close();
  });

  const createFolder = (body: Record<string, any>) =>
    client
      .post(`/api/v1/namespaces/${client.namespace.id}/rss-folders`)
      .send(body);

  // The basic tier allows a single active rss folder per space, so each test
  // must leave the shared namespace without active folders.
  afterEach(async () => {
    const dataSource = client.app.get(DataSource);
    const folders: { id: string }[] = await dataSource.query(
      `SELECT id FROM resources
       WHERE namespace_id = $1 AND resource_type = 'rss_folder' AND deleted_at IS NULL`,
      [client.namespace.id],
    );
    for (const folder of folders) {
      await client
        .delete(
          `/api/v1/namespaces/${client.namespace.id}/rss-folders/${folder.id}`,
        )
        .expect(200);
    }
  });

  it('returns basic limits with 1-link and 1-folder limits', async () => {
    const response = await client
      .get(`/api/v1/namespaces/${client.namespace.id}/rss-folders/limits`)
      .expect(200);
    expect(response.body).toEqual({
      tier: 'basic',
      link_limit: 1,
      folder_private_limit: 1,
      folder_team_limit: 1,
      folder_private_used: 0,
      folder_team_used: 0,
    });
  });

  it('creates an rss folder and uses the feed title as default link name', async () => {
    const response = await createFolder({
      name: 'My Subscriptions',
      parent_id: client.namespace.root_resource_id,
      links: [{ url: 'https://example.com/feed' }],
    }).expect(201);

    expect(response.body.resource.name).toBe('My Subscriptions');
    expect(response.body.resource.resource_type).toBe('rss_folder');
    expect(response.body.links).toHaveLength(1);
    expect(response.body.links[0]).toMatchObject({
      index: 0,
      url: 'https://example.com/feed',
      name: 'Example RSS Feed',
    });
  });

  it('keeps the user-provided link name', async () => {
    const response = await createFolder({
      name: 'Named Subscriptions',
      parent_id: client.namespace.root_resource_id,
      links: [{ url: 'https://example.com/feed', name: 'Custom Name' }],
    }).expect(201);

    expect(response.body.links[0].name).toBe('Custom Name');
  });

  it('collapses duplicate urls to a single link', async () => {
    const response = await createFolder({
      name: 'Duplicate Links',
      parent_id: client.namespace.root_resource_id,
      // The same url twice would otherwise create two links and list every
      // item twice; it also stays within the basic tier's 1-link limit only
      // because the duplicate is collapsed before the limit is checked.
      links: [
        { url: 'https://example.com/feed', name: 'First' },
        { url: 'https://example.com/feed', name: 'Second' },
      ],
    }).expect(201);

    expect(response.body.links).toHaveLength(1);
    expect(response.body.links[0]).toMatchObject({
      index: 0,
      url: 'https://example.com/feed',
      name: 'First',
    });
  });

  it('rejects more links than the basic tier allows', async () => {
    const response = await createFolder({
      name: 'Too Many Links',
      parent_id: client.namespace.root_resource_id,
      links: [
        { url: 'https://example.com/feed1' },
        { url: 'https://example.com/feed2' },
      ],
    }).expect(HttpStatus.UNPROCESSABLE_ENTITY);

    expect(response.body.code).toBe('rss_folder_link_limit_exceeded');
  });

  it('rejects links that are not rss feeds with per-link indices', async () => {
    const response = await createFolder({
      name: 'Invalid Feed',
      parent_id: client.namespace.root_resource_id,
      links: [{ url: 'https://example.com/invalid' }],
    }).expect(HttpStatus.UNPROCESSABLE_ENTITY);

    expect(response.body.code).toBe('rss_feed_invalid');
    expect(response.body.failed).toEqual([
      { index: 0, url: 'https://example.com/invalid' },
    ]);
  });

  it('gets, updates and deletes an rss folder', async () => {
    const created = (
      await createFolder({
        name: 'Lifecycle',
        parent_id: client.namespace.root_resource_id,
        links: [{ url: 'https://example.com/feed' }],
      }).expect(201)
    ).body;
    const resourceId = created.resource.id;
    const base = `/api/v1/namespaces/${client.namespace.id}/rss-folders/${resourceId}`;

    const fetched = (await client.get(`${base}/config`).expect(200)).body;
    expect(fetched.resource.id).toBe(resourceId);
    expect(fetched.links).toHaveLength(1);

    const renamed = (
      await client.patch(`${base}/config`).send({ name: 'Renamed' }).expect(200)
    ).body;
    expect(renamed.resource.name).toBe('Renamed');
    expect(renamed.links).toHaveLength(1);

    const relinked = (
      await client
        .patch(`${base}/config`)
        .send({ links: [{ url: 'https://example.com/other', name: 'Other' }] })
        .expect(200)
    ).body;
    expect(relinked.links).toEqual([
      expect.objectContaining({
        index: 0,
        url: 'https://example.com/other',
        name: 'Other',
      }),
    ]);

    await client.delete(base).expect(200);
    await client.get(`${base}/config`).expect(HttpStatus.NOT_FOUND);
  });

  it('rolls back the name when the link update fails in the same request', async () => {
    const created = (
      await createFolder({
        name: 'Atomic',
        parent_id: client.namespace.root_resource_id,
        links: [{ url: 'https://example.com/feed', name: 'Original' }],
      }).expect(201)
    ).body;
    const base = `/api/v1/namespaces/${client.namespace.id}/rss-folders/${created.resource.id}`;

    // Fail only the rss_links write, which runs after the name update inside the
    // same transaction. If the two are not atomic, the name change would survive
    // this failure.
    // eslint-disable-next-line @typescript-eslint/unbound-method -- reapplied with an explicit `this` below
    const originalSave = EntityManager.prototype.save;
    const saveSpy = jest
      .spyOn(EntityManager.prototype, 'save')
      .mockImplementation(function (this: EntityManager, ...args: any[]) {
        const target = args[0];
        const savingLink =
          target instanceof RssLink ||
          (Array.isArray(target) && target[0] instanceof RssLink);
        if (savingLink) {
          throw new Error('injected rss_links failure');
        }
        return (originalSave as any).apply(this, args);
      });

    try {
      await client
        .patch(`${base}/config`)
        .send({
          name: 'Atomic Renamed',
          links: [{ url: 'https://example.com/other', name: 'Other' }],
        })
        .expect(HttpStatus.INTERNAL_SERVER_ERROR);
    } finally {
      saveSpy.mockRestore();
    }

    // The failed link write must have rolled back the name change too, and left
    // the original link untouched.
    const fetched = (await client.get(`${base}/config`).expect(200)).body;
    expect(fetched.resource.name).toBe('Atomic');
    expect(fetched.links).toEqual([
      expect.objectContaining({
        url: 'https://example.com/feed',
        name: 'Original',
      }),
    ]);

    await client.delete(base).expect(200);
  });

  it('updates links that already have polled items without a foreign key violation', async () => {
    const dataSource = client.app.get(DataSource);
    const contentRepo = dataSource.getRepository(RssItemContent);
    const itemRepo = dataSource.getRepository(RssItem);

    const created = (
      await createFolder({
        name: 'Has Items',
        parent_id: client.namespace.root_resource_id,
        links: [{ url: 'https://example.com/feed', name: 'Kept' }],
      }).expect(201)
    ).body;
    const base = `/api/v1/namespaces/${client.namespace.id}/rss-folders/${created.resource.id}`;
    const keptLinkId = created.links[0].id;

    // Simulate a poll having related an item to the folder's link.
    const content = await contentRepo.save(
      contentRepo.create({
        url: 'https://example.com/feed',
        guid: 'guid-1',
        content: 'body',
      }),
    );
    await itemRepo.save(
      itemRepo.create({
        linkId: keptLinkId,
        contentId: content.id,
        title: 'An item',
      }),
    );

    // Renaming the same feed reuses the existing link row, so its id and the
    // related rss_item survive the edit.
    const renamed = (
      await client
        .patch(`${base}/config`)
        .send({ links: [{ url: 'https://example.com/feed', name: 'Renamed' }] })
        .expect(200)
    ).body;
    expect(renamed.links[0].id).toBe(keptLinkId);
    expect(renamed.links[0].name).toBe('Renamed');
    expect(await itemRepo.countBy({ linkId: keptLinkId })).toBe(1);

    // Replacing the feed removes the link and its now-orphaned rss_items.
    await client
      .patch(`${base}/config`)
      .send({ links: [{ url: 'https://example.com/other', name: 'Other' }] })
      .expect(200);
    expect(await itemRepo.countBy({ linkId: keptLinkId })).toBe(0);

    await client.delete(base).expect(200);
  });

  it('rejects creating resources inside an rss folder', async () => {
    const created = (
      await createFolder({
        name: 'No Children',
        parent_id: client.namespace.root_resource_id,
        links: [{ url: 'https://example.com/feed' }],
      }).expect(201)
    ).body;

    const response = await client
      .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
      .send({
        name: 'child doc',
        resourceType: 'doc',
        parentId: created.resource.id,
      })
      .expect(HttpStatus.UNPROCESSABLE_ENTITY);

    expect(response.body.code).toBe('rss_folder_cannot_be_parent');
  });

  it('rejects a second folder in the same space and frees the quota on delete', async () => {
    const first = (
      await createFolder({
        name: 'First Folder',
        parent_id: client.namespace.root_resource_id,
        links: [{ url: 'https://example.com/feed' }],
      }).expect(201)
    ).body;

    const rejected = await createFolder({
      name: 'Second Folder',
      parent_id: client.namespace.root_resource_id,
      links: [{ url: 'https://example.com/feed' }],
    }).expect(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(rejected.body.code).toBe('rss_folder_quota_exceeded');

    await client
      .delete(
        `/api/v1/namespaces/${client.namespace.id}/rss-folders/${first.resource.id}`,
      )
      .expect(200);

    await createFolder({
      name: 'Second Folder',
      parent_id: client.namespace.root_resource_id,
      links: [{ url: 'https://example.com/feed' }],
    }).expect(201);
  });

  it('counts teamspace folders against the team quota, not the private one', async () => {
    const privateRoot = (
      await client
        .get(`/api/v1/namespaces/${client.namespace.id}/private`)
        .expect(200)
    ).body;

    await createFolder({
      name: 'Team Folder',
      parent_id: client.namespace.root_resource_id,
      links: [{ url: 'https://example.com/feed' }],
    }).expect(201);

    await createFolder({
      name: 'Private Folder',
      parent_id: privateRoot.id,
      links: [{ url: 'https://example.com/feed' }],
    }).expect(201);

    const limits = (
      await client
        .get(`/api/v1/namespaces/${client.namespace.id}/rss-folders/limits`)
        .expect(200)
    ).body;
    expect(limits).toEqual({
      tier: 'basic',
      link_limit: 1,
      folder_private_limit: 1,
      folder_team_limit: 1,
      folder_private_used: 1,
      folder_team_used: 1,
    });
  });

  it('gates restoring an rss folder from trash by the quota', async () => {
    const trashed = (
      await createFolder({
        name: 'Trashed Folder',
        parent_id: client.namespace.root_resource_id,
        links: [{ url: 'https://example.com/feed' }],
      }).expect(201)
    ).body;
    await client
      .delete(
        `/api/v1/namespaces/${client.namespace.id}/rss-folders/${trashed.resource.id}`,
      )
      .expect(200);

    const occupying = (
      await createFolder({
        name: 'Occupying Folder',
        parent_id: client.namespace.root_resource_id,
        links: [{ url: 'https://example.com/feed' }],
      }).expect(201)
    ).body;

    const rejected = await client
      .post(
        `/api/v1/namespaces/${client.namespace.id}/resources/${trashed.resource.id}/restore`,
      )
      .expect(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(rejected.body.code).toBe('rss_folder_quota_exceeded');

    await client
      .delete(
        `/api/v1/namespaces/${client.namespace.id}/rss-folders/${occupying.resource.id}`,
      )
      .expect(200);

    await client
      .post(
        `/api/v1/namespaces/${client.namespace.id}/resources/${trashed.resource.id}/restore`,
      )
      .expect(201);
  });

  it('rejects an invalid url at dto validation', async () => {
    await createFolder({
      name: 'Bad URL',
      parent_id: client.namespace.root_resource_id,
      links: [{ url: 'not-a-url' }],
    }).expect(HttpStatus.BAD_REQUEST);
  });

  it('rejects a missing parent_id', async () => {
    await createFolder({
      name: 'No Parent',
      links: [{ url: 'https://example.com/feed' }],
    }).expect(HttpStatus.BAD_REQUEST);
  });
});
