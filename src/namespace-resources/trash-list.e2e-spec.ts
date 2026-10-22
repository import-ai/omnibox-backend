import { HttpStatus } from '@nestjs/common';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import { TestClient } from 'test/test-client';

describe('Trash list paging (e2e)', () => {
  let client: TestClient;

  const ITEM_COUNT = 21;
  const PAGE_SIZE = 20;
  const itemName = (index: number) =>
    `Trash 2791 ${String(index).padStart(2, '0')}`;

  const listTrash = async (query: string) => {
    const response = await client
      .get(`/api/v1/namespaces/${client.namespace.id}/resources/trash?${query}`)
      .expect(HttpStatus.OK);
    return response.body as {
      items: Array<{ id: string; name: string; deleted_at: string }>;
      total: number;
      limit: number;
      offset: number;
      trash_retention_days: number;
    };
  };

  beforeAll(async () => {
    client = await TestClient.create();
    expect((await listTrash('limit=100&offset=0')).total).toBe(0);

    for (let index = 0; index < ITEM_COUNT; index++) {
      const created = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .send({
          name: itemName(index),
          namespaceId: client.namespace.id,
          resourceType: ResourceType.DOC,
          parentId: client.namespace.root_resource_id,
          content: '',
        })
        .expect(HttpStatus.CREATED);
      await client
        .delete(
          `/api/v1/namespaces/${client.namespace.id}/resources/${created.body.id}`,
        )
        .expect(HttpStatus.OK);
    }
  });

  afterAll(async () => {
    await client?.close();
  });

  it('returns every later page instead of stopping at 20', async () => {
    const first = await listTrash(`limit=${PAGE_SIZE}&offset=0`);
    const second = await listTrash(`limit=${PAGE_SIZE}&offset=${PAGE_SIZE}`);
    const pastEnd = await listTrash(`limit=${PAGE_SIZE}&offset=${ITEM_COUNT}`);

    expect(first.total).toBe(ITEM_COUNT);
    expect(second.total).toBe(ITEM_COUNT);
    expect(pastEnd.total).toBe(ITEM_COUNT);
    expect(first.items).toHaveLength(PAGE_SIZE);
    expect(second.items).toHaveLength(ITEM_COUNT - PAGE_SIZE);
    expect(pastEnd.items).toEqual([]);
    expect(first.trash_retention_days).toEqual(expect.any(Number));

    const collected = [...first.items, ...second.items];
    expect(new Set(collected.map((item) => item.id)).size).toBe(ITEM_COUNT);
    expect(collected.map((item) => item.name).sort()).toEqual(
      Array.from({ length: ITEM_COUNT }, (_, index) => itemName(index)).sort(),
    );
    for (let index = 1; index < collected.length; index++) {
      expect(Date.parse(collected[index].deleted_at)).toBeLessThanOrEqual(
        Date.parse(collected[index - 1].deleted_at),
      );
    }
  });

  it('pages a search that matches more than one window', async () => {
    const first = await listTrash(
      `search=${encodeURIComponent('Trash 2791')}&limit=${PAGE_SIZE}&offset=0`,
    );
    const second = await listTrash(
      `search=${encodeURIComponent('Trash 2791')}&limit=${PAGE_SIZE}&offset=${PAGE_SIZE}`,
    );
    const one = await listTrash(
      `search=${encodeURIComponent(itemName(7))}&limit=${PAGE_SIZE}&offset=0`,
    );

    expect(first.total).toBe(ITEM_COUNT);
    expect(second.total).toBe(ITEM_COUNT);
    expect(first.items).toHaveLength(PAGE_SIZE);
    expect(second.items).toHaveLength(ITEM_COUNT - PAGE_SIZE);
    expect(one.total).toBe(1);
    expect(one.items.map((item) => item.name)).toEqual([itemName(7)]);
  });
});
