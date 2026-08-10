import { HttpStatus } from '@nestjs/common';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import { TestClient } from 'test/test-client';

describe('Resource sorting (e2e)', () => {
  let client: TestClient;
  let folderId: string;
  let alphaId: string;
  let betaId: string;

  const resourceUrl = () =>
    `/api/v1/namespaces/${client.namespace.id}/resources`;

  beforeAll(async () => {
    client = await TestClient.create();
    const folder = await client
      .post(resourceUrl())
      .send({
        name: 'Sorting folder',
        namespaceId: client.namespace.id,
        resourceType: ResourceType.FOLDER,
        parentId: client.namespace.root_resource_id,
      })
      .expect(HttpStatus.CREATED);
    folderId = folder.body.id;

    const beta = await client
      .post(resourceUrl())
      .send({
        name: 'Beta',
        namespaceId: client.namespace.id,
        resourceType: ResourceType.DOC,
        parentId: folderId,
      })
      .expect(HttpStatus.CREATED);
    betaId = beta.body.id;

    const alpha = await client
      .post(resourceUrl())
      .send({
        name: 'Alpha',
        namespaceId: client.namespace.id,
        resourceType: ResourceType.DOC,
        parentId: folderId,
      })
      .expect(HttpStatus.CREATED);
    alphaId = alpha.body.id;
  });

  afterAll(async () => {
    await client.close();
  });

  it('sorts a normal folder and persists manual order', async () => {
    const titleSorted = await client
      .get(`${resourceUrl()}/${folderId}/children?sort_by=title&sort_order=asc`)
      .expect(HttpStatus.OK);
    expect(titleSorted.body.map(({ id }) => id)).toEqual([alphaId, betaId]);

    await client
      .post(`${resourceUrl()}/${client.namespace.root_resource_id}/manual-sort`)
      .send({ sort_by: 'title', sort_order: 'asc' })
      .expect(HttpStatus.CREATED);

    await client
      .put(`${resourceUrl()}/manual-sort`)
      .send({
        root_resource_id: client.namespace.root_resource_id,
        orders: [{ parent_id: folderId, resource_ids: [betaId, alphaId] }],
      })
      .expect(HttpStatus.OK);

    const manualSorted = await client
      .get(`${resourceUrl()}/${folderId}/children?sort_by=manual`)
      .expect(HttpStatus.OK);
    expect(manualSorted.body.map(({ id }) => id)).toEqual([betaId, alphaId]);

    const unspecified = await client
      .post(resourceUrl())
      .send({
        name: 'A newly created resource',
        namespaceId: client.namespace.id,
        resourceType: ResourceType.DOC,
        parentId: folderId,
      })
      .expect(HttpStatus.CREATED);
    const withUnspecified = await client
      .get(`${resourceUrl()}/${folderId}/children?sort_by=manual`)
      .expect(HttpStatus.OK);
    expect(withUnspecified.body.map(({ id }) => id)).toEqual([
      betaId,
      alphaId,
      unspecified.body.id,
    ]);
  });

  it('stores share sorting independently and follows live manual order', async () => {
    let share = await client
      .patch(`${resourceUrl()}/${folderId}/share`)
      .send({ enabled: true, sort_by: 'title', sort_order: 'desc' })
      .expect(HttpStatus.OK);
    expect(share.body).toEqual(
      expect.objectContaining({
        all_resources: true,
        sort_by: 'title',
        sort_order: 'desc',
        manual_sort_available: true,
      }),
    );

    let sharedChildren = await client
      .get(`/api/v1/shares/${share.body.id}/resources/${folderId}/children`)
      .expect(HttpStatus.OK);
    expect(sharedChildren.body.map(({ name }) => name)).toEqual([
      'Beta',
      'Alpha',
      'A newly created resource',
    ]);

    share = await client
      .patch(`${resourceUrl()}/${folderId}/share`)
      .send({ sort_by: 'manual' })
      .expect(HttpStatus.OK);
    sharedChildren = await client
      .get(`/api/v1/shares/${share.body.id}/resources/${folderId}/children`)
      .expect(HttpStatus.OK);
    expect(sharedChildren.body.map(({ id }) => id)).toEqual([
      betaId,
      alphaId,
      expect.any(String),
    ]);
  });
});
