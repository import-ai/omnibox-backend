import { createHash } from 'node:crypto';

import { HttpStatus } from '@nestjs/common';
import { NamespaceTier } from 'omniboxd/namespaces/dto/namespace-tier.enum';
import { NamespacesQuotaService } from 'omniboxd/namespaces/namespaces-quota.service';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';
import { ResourceRevision } from 'omniboxd/resources/entities/resource-revision.entity';
import { ResourceRevisionService } from 'omniboxd/resources/resource-revision.service';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { transaction } from 'omniboxd/utils/transaction-utils';
import { TestClient } from 'test/test-client';
import { DataSource } from 'typeorm';

describe('Resource revisions (e2e)', () => {
  let client: TestClient;
  let uid = 0;
  const uniqueName = (base: string) => `${base} ${++uid}`;

  beforeAll(async () => {
    client = await TestClient.create();
  });

  afterAll(async () => {
    await client?.close();
  });

  afterEach(() => jest.restoreAllMocks());

  const createDoc = async (name: string, content: string) => {
    const response = await client
      .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
      .send({
        name,
        namespaceId: client.namespace.id,
        resourceType: ResourceType.DOC,
        parentId: client.namespace.root_resource_id,
        content,
      })
      .expect(HttpStatus.CREATED);
    return response.body;
  };

  const listRevisions = (resourceId: string) =>
    client.get(
      `/api/v1/namespaces/${client.namespace.id}/resources/${resourceId}/revisions`,
    );

  it.each([ResourceType.FILE, ResourceType.LINK])(
    'tracks and restores existing %s content',
    async (resourceType) => {
      const resource = await client.app.get(ResourcesService).createResource({
        namespaceId: client.namespace.id,
        parentId: client.namespace.root_resource_id,
        userId: client.user.id,
        resourceType,
        name: uniqueName('Existing resource'),
        content: 'Original content',
        attrs: { url: 'https://example.com/source' },
      });
      const repo = client.app.get(DataSource).getRepository(ResourceRevision);
      expect(await repo.countBy({ resourceId: resource.id })).toBe(0);
      // Simulate a resource created before history supported this type.
      await repo.delete({ resourceId: resource.id });
      const path = `/api/v1/namespaces/${client.namespace.id}/resources/${resource.id}`;
      await client
        .patch(path)
        .send({ content: 'Edited content' })
        .expect(HttpStatus.OK);
      const revisions = await listRevisions(resource.id).expect(HttpStatus.OK);
      expect(revisions.body).toHaveLength(2);
      const previousId = revisions.body[1].id;
      const previous = await client
        .get(`${path}/revisions/${previousId}`)
        .expect(HttpStatus.OK);
      expect(previous.body.content).toBe('Original content');
      await client
        .post(`${path}/revisions/${previousId}/restore`)
        .expect(HttpStatus.CREATED);
      const restored = await client.get(path).expect(HttpStatus.OK);
      expect(restored.body).toMatchObject({
        content: 'Original content',
        resource_type: resourceType,
        attrs: { url: 'https://example.com/source' },
      });
      expect((await listRevisions(resource.id)).body).toHaveLength(3);
    },
  );

  it('creates an untitled document from the sidebar and preserves its empty initial revision', async () => {
    const created = await client
      .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
      .send({
        resourceType: ResourceType.DOC,
        parentId: client.namespace.root_resource_id,
      })
      .expect(HttpStatus.CREATED);
    const path = `/api/v1/namespaces/${client.namespace.id}/resources/${created.body.id}`;
    expect(created.body.name).toBe('');
    const current = await client
      .get(`${path}/revisions/current`)
      .expect(HttpStatus.OK);
    expect(current.body).toMatchObject({ name: '', content: '' });
    await client
      .patch(path)
      .send({ name: uniqueName('Named document'), content: 'First edit' })
      .expect(HttpStatus.OK);
    const history = await listRevisions(created.body.id).expect(HttpStatus.OK);
    expect(history.body).toHaveLength(2);
    const original = await client
      .get(`${path}/revisions/${history.body[1].id}`)
      .expect(HttpStatus.OK);
    expect(original.body).toMatchObject({ name: '', content: '' });
  });

  it('lists only the current version for a newly created document', async () => {
    const resource = await createDoc(
      uniqueName('Revision create'),
      'Original content',
    );

    const response = await listRevisions(resource.id).expect(HttpStatus.OK);

    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      id: 'current',
      name: resource.name,
      version: 1,
      is_current: true,
    });
    expect(new Date(response.body[0].created_at).getTime()).toBe(
      new Date(resource.updated_at).getTime(),
    );
  });

  it('keeps the original version timestamp after the first edit', async () => {
    const resource = await createDoc(
      uniqueName('Revision first edit'),
      'Original content',
    );

    await client
      .patch(
        `/api/v1/namespaces/${client.namespace.id}/resources/${resource.id}`,
      )
      .send({
        content: 'Updated content',
        namespaceId: client.namespace.id,
      })
      .expect(HttpStatus.OK);

    const response = await listRevisions(resource.id).expect(HttpStatus.OK);

    expect(response.body).toHaveLength(2);
    expect(response.body[0]).toMatchObject({
      id: 'current',
      is_current: true,
    });
    expect(response.body[1]).toMatchObject({
      name: resource.name,
      is_current: false,
    });
    expect(response.body[1].id).not.toBe('current');
    expect(new Date(response.body[1].created_at).getTime()).toBe(
      new Date(resource.created_at).getTime(),
    );
    expect(new Date(response.body[0].created_at).getTime()).toBeGreaterThan(
      new Date(resource.created_at).getTime(),
    );

    const historical = await client
      .get(
        `/api/v1/namespaces/${client.namespace.id}/resources/${resource.id}/revisions/${response.body[1].id}`,
      )
      .expect(HttpStatus.OK);
    expect(historical.body.content).toBe('Original content');
  });

  it('restores a historical version as a new current version', async () => {
    const resource = await createDoc(
      uniqueName('Revision restore'),
      'Original content',
    );

    await client
      .patch(
        `/api/v1/namespaces/${client.namespace.id}/resources/${resource.id}`,
      )
      .send({
        content: 'Updated content',
        namespaceId: client.namespace.id,
      })
      .expect(HttpStatus.OK);

    const beforeRestore = await listRevisions(resource.id).expect(
      HttpStatus.OK,
    );
    const originalRevisionId = beforeRestore.body[1].id;

    await client
      .post(
        `/api/v1/namespaces/${client.namespace.id}/resources/${resource.id}/revisions/${originalRevisionId}/restore`,
      )
      .expect(HttpStatus.CREATED);

    const restored = await client
      .get(`/api/v1/namespaces/${client.namespace.id}/resources/${resource.id}`)
      .expect(HttpStatus.OK);
    expect(restored.body).toMatchObject({
      content: 'Original content',
      version: 3,
    });

    const afterRestore = await listRevisions(resource.id).expect(HttpStatus.OK);
    expect(
      afterRestore.body.map(
        (revision: { version: number }) => revision.version,
      ),
    ).toEqual([3, 2, 1]);
    expect(afterRestore.body[0]).toMatchObject({
      id: 'current',
      version: 3,
      is_current: true,
    });
    expect(
      afterRestore.body.some(
        (revision: { content?: string; is_current: boolean; id: string }) =>
          !revision.is_current && revision.id !== 'current',
      ),
    ).toBe(true);
  });
  it('creates a new revision even when restoring identical content', async () => {
    const resource = await createDoc(
      uniqueName('Repeated restore'),
      'Original',
    );
    const path = `/api/v1/namespaces/${client.namespace.id}/resources/${resource.id}`;
    await client.patch(path).send({ content: 'Changed' }).expect(HttpStatus.OK);
    const before = await listRevisions(resource.id).expect(HttpStatus.OK);
    const originalId = before.body[1].id;
    const repo = client.app.get(DataSource).getRepository(ResourceRevision);
    for (const expectedCount of [2, 3]) {
      await client
        .post(`${path}/revisions/${originalId}/restore`)
        .expect(HttpStatus.CREATED);
      expect(await repo.countBy({ resourceId: resource.id })).toBe(
        expectedCount,
      );
      const current = await client
        .get(`${path}/revisions/current`)
        .expect(HttpStatus.OK);
      expect(current.body).toMatchObject({
        content: 'Original',
        version: expectedCount + 1,
        author: { id: client.user.id },
      });
    }
  });

  it('uses the saved author and timestamp after metadata-only updates', async () => {
    const resource = await createDoc(
      uniqueName('Revision metadata'),
      'Original',
    );
    const actor = await client
      .post('/internal/api/v1/sign-up')
      .send({
        username: 'Revision editor',
        email: `revision-${Date.now()}@example.com`,
        password: 'Passw0rd',
      })
      .expect(HttpStatus.CREATED);
    const service = client.app.get(ResourcesService);
    await service.updateResource(
      client.namespace.id,
      resource.id,
      actor.body.id,
      { content: 'Edited' },
    );
    const before = await listRevisions(resource.id).expect(HttpStatus.OK);
    expect(before.body[0].author.id).toBe(actor.body.id);
    await service.updateResource(
      client.namespace.id,
      resource.id,
      client.user.id,
      { attrs: { reviewed: true } },
    );
    const after = await listRevisions(resource.id).expect(HttpStatus.OK);
    expect(after.body).toEqual(before.body);
  });

  it.each([
    [NamespaceTier.BASIC, 3],
    [NamespaceTier.PREMIUM, 100],
  ] as const)(
    'retains %s history within its limit of %i plus the current version',
    async (tier, limit) => {
      jest
        .spyOn(client.app.get(NamespacesQuotaService), 'getNamespaceTier')
        .mockResolvedValue(tier);
      const resource = await createDoc(uniqueName('Retention'), 'Original');
      const repo = client.app.get(DataSource).getRepository(ResourceRevision);
      let originalId: string | undefined;
      const service = client.app.get(ResourcesService);
      for (let index = 1; index <= limit + 2; index++) {
        await service.updateResource(
          client.namespace.id,
          resource.id,
          client.user.id,
          { content: `Edit ${index}` },
        );
        if (index === 1)
          originalId = (await repo.findOneByOrFail({ resourceId: resource.id }))
            .id;
      }
      const response = await listRevisions(resource.id).expect(HttpStatus.OK);
      expect(response.body).toHaveLength(limit + 1);
      expect(await repo.countBy({ resourceId: resource.id })).toBe(limit);
      const path = `/api/v1/namespaces/${client.namespace.id}/resources/${resource.id}/revisions`;
      const oldest = await client
        .get(`${path}/${response.body[limit].id}`)
        .expect(HttpStatus.OK);
      expect(oldest.body.content).toBe('Edit 2');
      await client.get(`${path}/${originalId}`).expect(HttpStatus.NOT_FOUND);
      await client
        .post(`${path}/${originalId}/restore`)
        .expect(HttpStatus.NOT_FOUND);
    },
  );

  it('enforces a downgraded limit on old links before the next save prunes history', async () => {
    const tier = jest
      .spyOn(client.app.get(NamespacesQuotaService), 'getNamespaceTier')
      .mockResolvedValue(NamespaceTier.PREMIUM);
    const resource = await createDoc(uniqueName('Downgrade'), 'Original');
    const repo = client.app.get(DataSource).getRepository(ResourceRevision);
    let originalId: string | undefined;
    const service = client.app.get(ResourcesService);
    for (let index = 1; index <= 5; index++) {
      await service.updateResource(
        client.namespace.id,
        resource.id,
        client.user.id,
        { content: `Edit ${index}` },
      );
      if (index === 1)
        originalId = (await repo.findOneByOrFail({ resourceId: resource.id }))
          .id;
    }
    tier.mockResolvedValue(NamespaceTier.BASIC);
    expect(await repo.countBy({ resourceId: resource.id })).toBe(5);
    const response = await listRevisions(resource.id).expect(HttpStatus.OK);
    expect(response.body).toHaveLength(4);
    const path = `/api/v1/namespaces/${client.namespace.id}/resources/${resource.id}/revisions/${originalId}`;
    await client.get(path).expect(HttpStatus.NOT_FOUND);
    await client.post(`${path}/restore`).expect(HttpStatus.NOT_FOUND);
    await service.updateResource(
      client.namespace.id,
      resource.id,
      client.user.id,
      { content: 'After downgrade' },
    );
    expect(await repo.countBy({ resourceId: resource.id })).toBe(3);
  });

  it('orders saves in the same transaction and rolls back when the tier cannot be read', async () => {
    const resource = await createDoc(
      uniqueName('Atomic revisions'),
      'Original',
    );
    const service = client.app.get(ResourcesService);
    const dataSource = client.app.get(DataSource);
    await transaction(dataSource.manager, async (tx) => {
      for (const content of ['First', 'Second']) {
        await service.updateResource(
          client.namespace.id,
          resource.id,
          client.user.id,
          { content },
          tx,
        );
      }
    });
    const path = `/api/v1/namespaces/${client.namespace.id}/resources/${resource.id}`;
    const current = await client
      .get(`${path}/revisions/current`)
      .expect(HttpStatus.OK);
    expect(current.body.content).toBe('Second');
    const before = await listRevisions(resource.id).expect(HttpStatus.OK);
    jest
      .spyOn(client.app.get(NamespacesQuotaService), 'getNamespaceTier')
      .mockRejectedValue(new Error('Unavailable'));
    await expect(
      service.updateResource(client.namespace.id, resource.id, client.user.id, {
        content: 'Failed save',
      }),
    ).rejects.toThrow('Unavailable');
    jest.restoreAllMocks();
    const after = await listRevisions(resource.id).expect(HttpStatus.OK);
    expect(after.body).toEqual(before.body);
    const live = await client.get(path).expect(HttpStatus.OK);
    expect(live.body.content).toBe('Second');
  });
  it('does not version identical saves, tags, or moves and keeps version metadata stable', async () => {
    const resource = await createDoc(uniqueName('Unchanged'), 'Original');
    const path = `/api/v1/namespaces/${client.namespace.id}/resources/${resource.id}`;
    const before = await listRevisions(resource.id).expect(200);
    await client
      .patch(path)
      .send({ name: resource.name, content: resource.content })
      .expect(200);
    await client
      .patch(path)
      .send({ attrs: { tested: true }, tag_ids: [] })
      .expect(200);
    const folder = await client
      .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
      .send({
        name: uniqueName('Destination'),
        resourceType: 'folder',
        parentId: client.namespace.root_resource_id,
      })
      .expect(201);
    await client.patch(path).send({ parentId: folder.body.id }).expect(200);
    expect((await listRevisions(resource.id).expect(200)).body).toEqual(
      before.body,
    );
    expect(
      await client.app
        .get(DataSource)
        .getRepository(ResourceRevision)
        .countBy({ resourceId: resource.id }),
    ).toBe(0);
    await client
      .patch(path)
      .send({ name: uniqueName('Renamed') })
      .expect(200);
    expect(
      (await listRevisions(resource.id)).body.map(
        (r: { version: number }) => r.version,
      ),
    ).toEqual([2, 1]);
  });

  it('serializes concurrent edits into distinct versions without losing intermediate content', async () => {
    const resource = await createDoc(uniqueName('Concurrent'), 'Original');
    const service = client.app.get(ResourcesService);
    await Promise.all(
      ['First', 'Second'].map((content) =>
        service.updateResource(
          client.namespace.id,
          resource.id,
          client.user.id,
          { content },
        ),
      ),
    );
    const revisions = (await listRevisions(resource.id).expect(200)).body;
    expect(revisions.map((r: { version: number }) => r.version)).toEqual([
      3, 2, 1,
    ]);
    const contents = await Promise.all(
      revisions.map(
        async (r: { id: string }) =>
          (
            await client
              .get(
                `/api/v1/namespaces/${client.namespace.id}/resources/${resource.id}/revisions/${r.id}`,
              )
              .expect(200)
          ).body.content,
      ),
    );
    expect(contents.sort()).toEqual(['First', 'Original', 'Second']);
  });

  it('rolls back both the archive and current version when a write fails after archiving', async () => {
    const resource = await createDoc(uniqueName('Rollback'), 'Original');
    const revisions = client.app.get(ResourceRevisionService);
    const archive = revisions.archive.bind(revisions);
    jest.spyOn(revisions, 'archive').mockImplementation(async (...args) => {
      await archive(...args);
      throw new Error('Archive failure');
    });
    await expect(
      client.app
        .get(ResourcesService)
        .updateResource(client.namespace.id, resource.id, client.user.id, {
          content: 'Failed',
        }),
    ).rejects.toThrow('Archive failure');
    expect(
      await client.app
        .get(DataSource)
        .getRepository(ResourceRevision)
        .countBy({ resourceId: resource.id }),
    ).toBe(0);
    expect(
      await client.app
        .get(DataSource)
        .getRepository(Resource)
        .findOneByOrFail({ id: resource.id }),
    ).toMatchObject({ content: 'Original', version: 1 });
  });

  it('retains comments but orphans their anchors only when restoring different content', async () => {
    const resource = await createDoc(uniqueName('Anchors'), 'Original');
    const path = `/api/v1/namespaces/${client.namespace.id}/resources/${resource.id}`;
    await client
      .patch(path)
      .send({ name: uniqueName('Renamed') })
      .expect(200);
    const original = (await listRevisions(resource.id)).body[1];
    await client
      .post(`${path}/comment-threads`)
      .send({
        quoted_text: 'Original',
        anchor_from: 1,
        anchor_to: 9,
        expected_content_hash: createHash('sha256')
          .update('Original')
          .digest('hex'),
        content: 'Keep this comment',
      })
      .expect(201);
    await client.post(`${path}/revisions/${original.id}/restore`).expect(201);
    let current = (await client.get(path).expect(200)).body;
    expect(current.comment_threads[0].anchor.status).toBe('active');
    await client.patch(path).send({ content: 'Different' }).expect(200);
    await client.post(`${path}/revisions/${original.id}/restore`).expect(201);
    current = (await client.get(path).expect(200)).body;
    expect(current.comment_threads[0].anchor.status).toBe('orphaned');
    expect(current.comment_threads[0].comments[0].content).toBe(
      'Keep this comment',
    );
  });

  it('rejects foreign revisions, invalid ids, unsupported resources and unauthorized restores', async () => {
    const resource = await createDoc(uniqueName('Protected'), 'Original');
    const other = await createDoc(uniqueName('Other'), 'Other');
    const path = `/api/v1/namespaces/${client.namespace.id}/resources/${resource.id}`;
    await client.patch(path).send({ content: 'Edited' }).expect(200);
    const id = (await listRevisions(resource.id)).body[1].id;
    const otherPath = `/api/v1/namespaces/${client.namespace.id}/resources/${other.id}/revisions/${id}`;
    await client.get(otherPath).expect(404);
    await client.post(`${otherPath}/restore`).expect(404);
    await client.get(`${path}/revisions/invalid`).expect(404);
    await client.post(`${path}/revisions/current/restore`).expect(404);
    await listRevisions(client.namespace.root_resource_id).expect(422);
    const viewer = new TestClient(client.app);
    await viewer.signUp();
    await viewer.get(`${path}/revisions`).expect(403);
    const invite = await client
      .post(`/api/v1/namespaces/${client.namespace.id}/invitations`)
      .send({
        namespaceRole: 'member',
        rootPermission: ResourcePermission.CAN_VIEW,
      })
      .expect(201);
    await viewer
      .post(
        `/api/v1/namespaces/${client.namespace.id}/invitations/${invite.body.id}/accept`,
      )
      .expect(201);
    await viewer.get(`${path}/revisions`).expect(200);
    await viewer.post(`${path}/revisions/${id}/restore`).expect(403);
  });

  it('does not require history entitlements for folder renames', async () => {
    const folder = await client
      .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
      .send({
        name: uniqueName('Folder'),
        resourceType: 'folder',
        parentId: client.namespace.root_resource_id,
      })
      .expect(201);
    const tier = jest
      .spyOn(client.app.get(NamespacesQuotaService), 'getNamespaceTier')
      .mockRejectedValue(new Error('Unavailable'));
    await client
      .patch(
        `/api/v1/namespaces/${client.namespace.id}/resources/${folder.body.id}`,
      )
      .send({ name: uniqueName('Renamed folder') })
      .expect(200);
    expect(tier).not.toHaveBeenCalled();
  });
  it('archives v1 when creating and editing a resource in the same transaction', async () => {
    const service = client.app.get(ResourcesService);
    const resource = await transaction(
      client.app.get(DataSource).manager,
      async (tx) => {
        const created = await service.createResource(
          {
            namespaceId: client.namespace.id,
            parentId: client.namespace.root_resource_id,
            userId: client.user.id,
            resourceType: ResourceType.DOC,
            name: uniqueName('Transactional create'),
            content: 'Original',
          },
          tx,
        );
        await service.updateResource(
          client.namespace.id,
          created.id,
          client.user.id,
          { content: 'Edited' },
          tx,
        );
        return created;
      },
    );
    const rows = (await listRevisions(resource.id).expect(200)).body;
    expect(rows.map((r: { version: number }) => r.version)).toEqual([2, 1]);
  });
});
