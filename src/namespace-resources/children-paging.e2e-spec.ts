import { HttpStatus } from '@nestjs/common';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import { TestClient } from 'test/test-client';

/**
 * The folder listing hands back one window of a folder's children at a time.
 * The window is taken after sorting and after permission filtering, and the
 * summary each row carries is a prefix of *that row's* content — a folder of a
 * few thousand rss items is read a page at a time rather than whole, so the
 * page and the content it shows are assembled from separate reads. These cases
 * pin the result of that assembly: the pages must tile the full listing exactly
 * once, in the listing's order, each row still wearing its own content, and
 * `total` must describe the whole listing rather than the page.
 */
describe('Folder children paging (e2e)', () => {
  let client: TestClient;
  let memberClient: TestClient;

  const CHILD_COUNT = 25;
  const PAGE_SIZE = 10;
  // Names sort the same way as creation order so that a title sort and a
  // created_at sort disagree only in direction, never in tie-breaking.
  const childName = (index: number) =>
    `Paged Child ${String(index).padStart(3, '0')}`;
  const childContent = (index: number) =>
    `Body of child ${String(index).padStart(3, '0')} ${'x'.repeat(200)}`;

  let folderId: string;
  let childIdsByName: Map<string, string>;
  let hiddenNames: string[];

  const listChildren = async (
    who: TestClient,
    resourceId: string,
    query: string,
  ) => {
    const response = await who
      .get(
        `/api/v1/namespaces/${client.namespace.id}/resources/${resourceId}/children?${query}`,
      )
      .expect(HttpStatus.OK);
    return response.body as Array<{
      id: string;
      name: string;
      content: string;
    }>;
  };

  // The internal listing is the only route that exposes `total`, and it shares
  // its implementation with the authenticated one.
  const listWithTotal = async (resourceId: string, query: string) => {
    const response = await client
      .request()
      .get(
        `/internal/api/v1/namespaces/${client.namespace.id}/resources/${resourceId}/list?${query}`,
      )
      .set('x-user-id', client.user.id)
      .expect(HttpStatus.OK);
    return response.body as {
      resources: Array<{ id: string; name: string }>;
      total: number;
    };
  };

  const pageThrough = async (
    who: TestClient,
    resourceId: string,
    sortQuery: string,
    expectedCount: number,
  ) => {
    const collected: Array<{ id: string; name: string; content: string }> = [];
    for (let offset = 0; offset <= expectedCount; offset += PAGE_SIZE) {
      const page = await listChildren(
        who,
        resourceId,
        `summary=true&limit=${PAGE_SIZE}&offset=${offset}&${sortQuery}`,
      );
      const remaining = Math.max(0, expectedCount - offset);
      expect(page).toHaveLength(Math.min(PAGE_SIZE, remaining));
      collected.push(...page);
    }
    return collected;
  };

  beforeAll(async () => {
    client = await TestClient.create();
    memberClient = await TestClient.create();

    const invitation = await client
      .post(`/api/v1/namespaces/${client.namespace.id}/invitations`)
      .send({
        namespaceRole: 'member',
        rootPermission: ResourcePermission.CAN_EDIT,
      })
      .expect(HttpStatus.CREATED);
    await memberClient
      .post(
        `/api/v1/namespaces/${client.namespace.id}/invitations/${invitation.body.id}/accept`,
      )
      .expect(HttpStatus.CREATED);

    const folder = await client
      .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
      .send({
        name: 'Paging Folder',
        namespaceId: client.namespace.id,
        resourceType: ResourceType.FOLDER,
        parentId: client.namespace.root_resource_id,
        content: '',
      })
      .expect(HttpStatus.CREATED);
    folderId = folder.body.id;

    childIdsByName = new Map();
    // Created one at a time so that created_at strictly increases: the order
    // under test must be the listing's, not the database's insertion order.
    for (let index = 0; index < CHILD_COUNT; index++) {
      const child = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .send({
          name: childName(index),
          namespaceId: client.namespace.id,
          resourceType: ResourceType.DOC,
          parentId: folderId,
          content: childContent(index),
        })
        .expect(HttpStatus.CREATED);
      childIdsByName.set(childName(index), child.body.id);
    }

    // Three rows scattered across the listing are hidden from the member, so a
    // page boundary that ignored the filter would show a hole or a short page.
    hiddenNames = [childName(2), childName(11), childName(23)];
    for (const name of hiddenNames) {
      await client
        .patch(
          `/api/v1/namespaces/${client.namespace.id}/resources/${childIdsByName.get(name)}/permissions/users/${memberClient.user.id}`,
        )
        .send({ permission: ResourcePermission.NO_ACCESS })
        .expect(HttpStatus.OK);
    }
  });

  afterAll(async () => {
    await memberClient?.close();
    await client?.close();
  });

  it('tiles the whole listing exactly once, in the unpaged order', async () => {
    for (const sortQuery of [
      'sort_by=created_at&sort_order=desc',
      'sort_by=created_at&sort_order=asc',
      'sort_by=title&sort_order=asc',
      'sort_by=updated_at&sort_order=desc',
    ]) {
      const unpaged = await listChildren(
        client,
        folderId,
        `summary=true&${sortQuery}`,
      );
      expect(unpaged).toHaveLength(CHILD_COUNT);

      const paged = await pageThrough(client, folderId, sortQuery, CHILD_COUNT);
      expect(paged.map((row) => row.id)).toEqual(unpaged.map((row) => row.id));
    }
  });

  it('gives every paged row its own content summary', async () => {
    const paged = await pageThrough(
      client,
      folderId,
      'sort_by=created_at&sort_order=desc',
      CHILD_COUNT,
    );
    expect(paged).toHaveLength(CHILD_COUNT);
    for (const row of paged) {
      const index = Number(row.name.slice('Paged Child '.length));
      // The summary is the row's own body, truncated to the prefix length.
      expect(row.content).toBe(childContent(index).slice(0, 100));
    }
  });

  it('cuts the last window short instead of wrapping, and stops past the end', async () => {
    const ordered = await listChildren(
      client,
      folderId,
      'summary=true&sort_by=created_at&sort_order=desc',
    );

    // A window straddling the end holds only what is left.
    const straddling = await listChildren(
      client,
      folderId,
      `summary=true&limit=${PAGE_SIZE}&offset=20&sort_by=created_at&sort_order=desc`,
    );
    expect(straddling.map((row) => row.id)).toEqual(
      ordered.slice(20, CHILD_COUNT).map((row) => row.id),
    );

    // The very last row, asked for on its own.
    const lastOnly = await listChildren(
      client,
      folderId,
      `summary=true&limit=1&offset=${CHILD_COUNT - 1}&sort_by=created_at&sort_order=desc`,
    );
    expect(lastOnly.map((row) => row.id)).toEqual([
      ordered[CHILD_COUNT - 1].id,
    ]);
    expect(lastOnly[0].content).toBe(ordered[CHILD_COUNT - 1].content);

    // Past the end there is nothing left to hand back.
    expect(
      await listChildren(
        client,
        folderId,
        `summary=true&limit=${PAGE_SIZE}&offset=${CHILD_COUNT}&sort_by=created_at&sort_order=desc`,
      ),
    ).toEqual([]);
    expect(
      await listChildren(
        client,
        folderId,
        `summary=true&limit=${PAGE_SIZE}&offset=999&sort_by=created_at&sort_order=desc`,
      ),
    ).toEqual([]);
  });

  it('reports the listing total at every window, not the window size', async () => {
    for (const offset of [0, 10, 20, CHILD_COUNT, 999]) {
      const page = await listWithTotal(
        folderId,
        `limit=${PAGE_SIZE}&offset=${offset}`,
      );
      expect(page.total).toBe(CHILD_COUNT);
      expect(page.resources.length).toBe(
        Math.min(PAGE_SIZE, Math.max(0, CHILD_COUNT - offset)),
      );
    }
  });

  it('pages over what the viewer may see, without holes or short pages', async () => {
    const visibleCount = CHILD_COUNT - hiddenNames.length;
    const unpaged = await listChildren(
      memberClient,
      folderId,
      'summary=true&sort_by=created_at&sort_order=desc',
    );
    expect(unpaged).toHaveLength(visibleCount);
    expect(unpaged.map((row) => row.name)).toEqual(
      expect.not.arrayContaining(hiddenNames),
    );

    const paged = await pageThrough(
      memberClient,
      folderId,
      'sort_by=created_at&sort_order=desc',
      visibleCount,
    );
    expect(paged.map((row) => row.id)).toEqual(unpaged.map((row) => row.id));
    // The window the hidden rows would have fallen into is still full.
    expect(
      (
        await listChildren(
          memberClient,
          folderId,
          `summary=true&limit=${PAGE_SIZE}&offset=10&sort_by=created_at&sort_order=desc`,
        )
      ).map((row) => row.id),
    ).toEqual(unpaged.slice(10, 20).map((row) => row.id));
  });
});
