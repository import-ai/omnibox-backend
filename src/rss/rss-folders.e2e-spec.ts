import { HttpStatus } from '@nestjs/common';
import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';
import { ResourcesService } from 'omniboxd/resources/resources.service';
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

  it("trashes a removed link's item resources and keeps a reused link's", async () => {
    const dataSource = client.app.get(DataSource);
    const resourceRepo = dataSource.getRepository(Resource);

    const created = (
      await createFolder({
        name: 'Has Items',
        parent_id: client.namespace.root_resource_id,
        links: [{ url: 'https://example.com/feed', name: 'Kept' }],
      }).expect(201)
    ).body;
    const base = `/api/v1/namespaces/${client.namespace.id}/rss-folders/${created.resource.id}`;
    const keptLinkId = created.links[0].id;

    // Simulate a poll having created an item resource for the folder's link.
    const item = await resourceRepo.save(
      resourceRepo.create({
        namespaceId: client.namespace.id,
        userId: client.user.id,
        parentId: created.resource.id,
        name: 'An item',
        resourceType: ResourceType.RSS_ITEM,
        content: 'body',
        contentSize: '4',
        attrs: { link_id: keptLinkId, guid: 'guid-1' },
      }),
    );

    // Renaming the same feed reuses the existing link row, so its id and its
    // item resources survive the edit.
    const renamed = (
      await client
        .patch(`${base}/config`)
        .send({ links: [{ url: 'https://example.com/feed', name: 'Renamed' }] })
        .expect(200)
    ).body;
    expect(renamed.links[0].id).toBe(keptLinkId);
    expect(renamed.links[0].name).toBe('Renamed');
    expect(await resourceRepo.countBy({ id: item.id })).toBe(1);

    // Replacing the feed removes the link and trashes its now-orphaned items.
    await client
      .patch(`${base}/config`)
      .send({ links: [{ url: 'https://example.com/other', name: 'Other' }] })
      .expect(200);
    expect(await resourceRepo.countBy({ id: item.id })).toBe(0);
    const trashed = await resourceRepo.findOneOrFail({
      withDeleted: true,
      where: { id: item.id },
    });
    expect(trashed.deletedAt).not.toBeNull();

    await client.delete(base).expect(200);
  });

  it('rejects any child of an rss folder that is not an rss item', async () => {
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

    expect(response.body.code).toBe('rss_folder_child_must_be_rss_item');
  });

  it('rejects an rss item created outside an rss folder', async () => {
    // The public create DTO accepts any ResourceType, so the type itself is
    // rejected first: items are written only by the poller.
    const rejected = await client
      .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
      .send({
        name: 'orphan item',
        resourceType: 'rss_item',
        parentId: client.namespace.root_resource_id,
      })
      .expect(HttpStatus.FORBIDDEN);
    expect(rejected.body.code).toBe('resource_read_only');

    // ... and even the internal create path enforces the containment rule.
    const resourcesService = client.app.get(ResourcesService);
    await expect(
      resourcesService.createResource(
        {
          namespaceId: client.namespace.id,
          parentId: client.namespace.root_resource_id,
          userId: client.user.id,
          resourceType: ResourceType.RSS_ITEM,
          name: 'orphan item',
        },
        undefined,
        false,
        { internal: true },
      ),
    ).rejects.toMatchObject({ code: 'RSS_ITEM_PARENT_MUST_BE_RSS_FOLDER' });

    // A parent is required, too.
    await expect(
      resourcesService.createResource(
        {
          namespaceId: client.namespace.id,
          parentId: null,
          userId: client.user.id,
          resourceType: ResourceType.RSS_ITEM,
          name: 'parentless item',
        },
        undefined,
        false,
        { internal: true },
      ),
    ).rejects.toMatchObject({ code: 'RSS_ITEM_PARENT_MUST_BE_RSS_FOLDER' });
  });

  it('rejects any child of an rss item', async () => {
    // An item is a leaf: it is neither a container the user can fill nor a
    // move target, otherwise resources would hide inside poller-owned rows.
    const dataSource = client.app.get(DataSource);
    const resourceRepo = dataSource.getRepository(Resource);
    const created = (
      await createFolder({
        name: 'Leaf Items',
        parent_id: client.namespace.root_resource_id,
        links: [{ url: 'https://example.com/feed' }],
      }).expect(201)
    ).body;
    const item = await resourceRepo.save(
      resourceRepo.create({
        namespaceId: client.namespace.id,
        userId: client.user.id,
        parentId: created.resource.id,
        name: 'Leaf item',
        resourceType: ResourceType.RSS_ITEM,
        content: 'body',
        contentSize: '4',
        attrs: { link_id: created.links[0].id, guid: 'guid-leaf' },
      }),
    );
    const base = `/api/v1/namespaces/${client.namespace.id}/resources`;

    for (const resourceType of ['doc', 'folder', 'link']) {
      const response = await client
        .post(base)
        .send({
          name: `child ${resourceType}`,
          resourceType,
          parentId: item.id,
        })
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(response.body.code).toBe('rss_item_cannot_be_parent');
    }

    // Moving an existing resource under an item is refused for the same reason.
    const doc = (
      await client
        .post(base)
        .send({
          name: 'stray doc',
          resourceType: 'doc',
          parentId: client.namespace.root_resource_id,
        })
        .expect(201)
    ).body;
    const moved = await client
      .post(`${base}/${doc.id}/move/${item.id}`)
      .expect(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(moved.body.code).toBe('rss_item_cannot_be_parent');

    // The item really has no children.
    const children = await client
      .get(`${base}/${item.id}/children`)
      .expect(200);
    expect(children.body.records ?? children.body.data ?? []).toHaveLength(0);

    await client
      .delete(
        `/api/v1/namespaces/${client.namespace.id}/rss-folders/${created.resource.id}`,
      )
      .expect(200);
    await resourceRepo.softDelete({ id: item.id });
  });

  it('rejects a batch move into an rss item or an rss folder', async () => {
    // The single-move path checks containment; the batch path used to reach the
    // raw parent_id update without ever looking at what the target is.
    const dataSource = client.app.get(DataSource);
    const resourceRepo = dataSource.getRepository(Resource);
    const created = (
      await createFolder({
        name: 'Batch Target',
        parent_id: client.namespace.root_resource_id,
        links: [{ url: 'https://example.com/feed' }],
      }).expect(201)
    ).body;
    const folderId = created.resource.id;
    const item = await resourceRepo.save(
      resourceRepo.create({
        namespaceId: client.namespace.id,
        userId: client.user.id,
        parentId: folderId,
        name: 'Batch target item',
        resourceType: ResourceType.RSS_ITEM,
        content: 'body',
        contentSize: '4',
        attrs: { link_id: created.links[0].id, guid: 'guid-batch-target' },
      }),
    );
    const base = `/api/v1/namespaces/${client.namespace.id}/resources`;
    const doc = (
      await client
        .post(base)
        .send({
          name: 'batch doc',
          resourceType: 'doc',
          parentId: client.namespace.root_resource_id,
        })
        .expect(201)
    ).body;
    const folder = (
      await client
        .post(base)
        .send({
          name: 'batch folder',
          resourceType: 'folder',
          parentId: client.namespace.root_resource_id,
        })
        .expect(201)
    ).body;

    for (const [targetId, code] of [
      [item.id, 'rss_item_cannot_be_parent'],
      [folderId, 'rss_folder_child_must_be_rss_item'],
    ] as const) {
      const moved = await client
        .post(`${base}/batch-move`)
        .send({ resourceIds: [doc.id, folder.id], targetId })
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(moved.body.code).toBe(code);
      // Grouping the same resources into a new folder under the target is
      // refused for the same reason.
      const grouped = await client
        .post(`${base}/batch-folder`)
        .send({
          resourceIds: [doc.id],
          parentId: targetId,
          name: `grouped ${targetId}`,
        })
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(grouped.body.code).toBe(code);
    }

    // Nothing moved.
    for (const id of [doc.id, folder.id]) {
      const after = await resourceRepo.findOneOrFail({ where: { id } });
      expect(after.parentId).toBe(client.namespace.root_resource_id);
    }

    await client.delete(`${base}/${doc.id}`).expect(200);
    await client.delete(`${base}/${folder.id}`).expect(200);
    await client
      .delete(
        `/api/v1/namespaces/${client.namespace.id}/rss-folders/${folderId}`,
      )
      .expect(200);
    await resourceRepo.softDelete({ id: item.id });
  });

  it('keeps retired rss items out of the trash and out of restore', async () => {
    const dataSource = client.app.get(DataSource);
    const resourceRepo = dataSource.getRepository(Resource);
    const created = (
      await createFolder({
        name: 'Retired Items',
        parent_id: client.namespace.root_resource_id,
        links: [{ url: 'https://example.com/feed' }],
      }).expect(201)
    ).body;
    const folderId = created.resource.id;
    const item = await resourceRepo.save(
      resourceRepo.create({
        namespaceId: client.namespace.id,
        userId: client.user.id,
        parentId: folderId,
        name: 'Retired item',
        resourceType: ResourceType.RSS_ITEM,
        content: 'body',
        contentSize: '4',
        attrs: { link_id: created.links[0].id, guid: 'guid-retired' },
      }),
    );
    // The poller retires an item when its subscription stops carrying it.
    await resourceRepo.softDelete({ id: item.id });
    const base = `/api/v1/namespaces/${client.namespace.id}/resources`;

    // It is the product's row, so it is not one of the user's deleted things.
    const trash = await client.get(`${base}/trash?limit=100`).expect(200);
    expect(
      (trash.body.items as Array<{ id: string }>).map((entry) => entry.id),
    ).not.toContain(item.id);

    // ... and bringing it back is not the user's call either.
    const restored = await client
      .post(`${base}/${item.id}/restore`)
      .expect(HttpStatus.FORBIDDEN);
    expect(restored.body.code).toBe('resource_read_only');
    const afterRestore = await resourceRepo.findOneOrFail({
      where: { id: item.id },
      withDeleted: true,
    });
    expect(afterRestore.deletedAt).not.toBeNull();
    expect(afterRestore.parentId).toBe(folderId);

    // Deleting it forever is not the user's call either: the trash never
    // offered it, so the mutation must agree with the listing.
    const purged = await client
      .delete(`${base}/trash/${item.id}`)
      .expect(HttpStatus.FORBIDDEN);
    expect(purged.body.code).toBe('resource_read_only');

    // Emptying the trash likewise reaches only what the trash listed, and says
    // so in its count.
    const listed = (await client.get(`${base}/trash?limit=100`).expect(200))
      .body as { total: number };
    const emptied = await client.delete(`${base}/trash`).expect(200);
    expect(emptied.body.deleted_count).toBe(listed.total);
    const afterEmpty = await resourceRepo.findOneOrFail({
      where: { id: item.id },
      withDeleted: true,
    });
    expect(afterEmpty.permanentDeletedAt).toBeNull();
    expect(afterEmpty.deletedAt).not.toBeNull();

    // The same holds once the rss folder itself is in the trash: the refused
    // restore must not re-parent the item to the user root on its way out.
    await client
      .delete(
        `/api/v1/namespaces/${client.namespace.id}/rss-folders/${folderId}`,
      )
      .expect(200);
    await client
      .post(`${base}/${item.id}/restore`)
      .expect(HttpStatus.FORBIDDEN);
    const afterTrashedParent = await resourceRepo.findOneOrFail({
      where: { id: item.id },
      withDeleted: true,
    });
    expect(afterTrashedParent.parentId).toBe(folderId);
  });

  it('refuses to manually sort the contents of an rss folder', async () => {
    const dataSource = client.app.get(DataSource);
    const resourceRepo = dataSource.getRepository(Resource);
    const created = (
      await createFolder({
        name: 'Sorted Items',
        parent_id: client.namespace.root_resource_id,
        links: [{ url: 'https://example.com/feed' }],
      }).expect(201)
    ).body;
    const folderId = created.resource.id;
    const item = await resourceRepo.save(
      resourceRepo.create({
        namespaceId: client.namespace.id,
        userId: client.user.id,
        parentId: folderId,
        name: 'Sorted item',
        resourceType: ResourceType.RSS_ITEM,
        content: 'body',
        contentSize: '4',
        attrs: { link_id: created.links[0].id, guid: 'guid-sorted' },
      }),
    );
    const base = `/api/v1/namespaces/${client.namespace.id}/resources`;
    await client
      .post(`${base}/${client.namespace.root_resource_id}/manual-sort`)
      .send({ sort_by: 'created_at', sort_order: 'desc', overwrite: true })
      .expect(201);

    // Naming the item is refused, and so is an order that names nothing at all:
    // every child of the parent is reindexed either way.
    for (const resourceIds of [[item.id], []]) {
      const response = await client
        .put(`${base}/manual-sort`)
        .send({
          root_resource_id: client.namespace.root_resource_id,
          orders: [{ parent_id: folderId, resource_ids: resourceIds }],
        })
        .expect(HttpStatus.FORBIDDEN);
      expect(response.body.code).toBe('resource_read_only');
    }
    const after = await resourceRepo.findOneOrFail({ where: { id: item.id } });
    expect(after.manualSortIndex).toBeNull();

    await client
      .delete(
        `/api/v1/namespaces/${client.namespace.id}/rss-folders/${folderId}`,
      )
      .expect(200);
    await resourceRepo.softDelete({ id: item.id });
  });

  it('never offers an rss item as a move target', async () => {
    const dataSource = client.app.get(DataSource);
    const resourceRepo = dataSource.getRepository(Resource);
    const created = (
      await createFolder({
        name: 'Picker Items',
        parent_id: client.namespace.root_resource_id,
        links: [{ url: 'https://example.com/feed' }],
      }).expect(201)
    ).body;
    const folderId = created.resource.id;
    const item = await resourceRepo.save(
      resourceRepo.create({
        namespaceId: client.namespace.id,
        userId: client.user.id,
        parentId: folderId,
        name: 'Pickable item',
        resourceType: ResourceType.RSS_ITEM,
        content: 'body',
        contentSize: '4',
        attrs: { link_id: created.links[0].id, guid: 'guid-pickable' },
      }),
    );
    const base = `/api/v1/namespaces/${client.namespace.id}/resources`;

    const found = await client.get(`${base}/search?name=Pickable`).expect(200);
    expect(found.body).toHaveLength(0);

    // Clients that reach the item through the batch lookup still learn it is
    // read-only, so they can gate its row actions.
    const looked = await client.get(`${base}?id=${item.id}`).expect(200);
    expect(looked.body[0]).toMatchObject({
      id: item.id,
      read_only: true,
    });

    await client
      .delete(
        `/api/v1/namespaces/${client.namespace.id}/rss-folders/${folderId}`,
      )
      .expect(200);
    await resourceRepo.softDelete({ id: item.id });
  });

  it('rejects every user-facing write to an rss item', async () => {
    const dataSource = client.app.get(DataSource);
    const resourceRepo = dataSource.getRepository(Resource);
    const created = (
      await createFolder({
        name: 'Read Only',
        parent_id: client.namespace.root_resource_id,
        links: [{ url: 'https://example.com/feed' }],
      }).expect(201)
    ).body;
    const folderId = created.resource.id;
    const item = await resourceRepo.save(
      resourceRepo.create({
        namespaceId: client.namespace.id,
        userId: client.user.id,
        parentId: folderId,
        name: 'Read only item',
        resourceType: ResourceType.RSS_ITEM,
        content: 'body',
        contentSize: '4',
        attrs: { link_id: created.links[0].id, guid: 'guid-read-only' },
      }),
    );
    const base = `/api/v1/namespaces/${client.namespace.id}/resources`;

    // Reading it is fine, and it advertises itself as read-only.
    const read = await client.get(`${base}/${item.id}`).expect(200);
    expect(read.body).toMatchObject({
      id: item.id,
      resource_type: 'rss_item',
      read_only: true,
    });

    const expectReadOnly = (body: Record<string, any>) =>
      expect(body.code).toBe('resource_read_only');

    expectReadOnly(
      (
        await client
          .patch(`${base}/${item.id}`)
          .send({ name: 'renamed' })
          .expect(HttpStatus.FORBIDDEN)
      ).body,
    );
    expectReadOnly(
      (
        await client
          .post(`${base}/${item.id}/move/${client.namespace.root_resource_id}`)
          .expect(HttpStatus.FORBIDDEN)
      ).body,
    );
    expectReadOnly(
      (await client.delete(`${base}/${item.id}`).expect(HttpStatus.FORBIDDEN))
        .body,
    );
    expectReadOnly(
      (
        await client
          .post(`${base}/${item.id}/duplicate`)
          .expect(HttpStatus.FORBIDDEN)
      ).body,
    );

    // The item is untouched by all of that.
    const after = await resourceRepo.findOneOrFail({ where: { id: item.id } });
    expect(after.name).toBe('Read only item');
    expect(after.parentId).toBe(folderId);

    await client
      .delete(
        `/api/v1/namespaces/${client.namespace.id}/rss-folders/${folderId}`,
      )
      .expect(200);
    await resourceRepo.softDelete({ id: item.id });
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
