import { HttpStatus } from '@nestjs/common';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import { TestClient } from 'test/test-client';

describe('POST /internal/api/v1/namespaces/:namespaceId/resources/visible-expanded (e2e)', () => {
  let owner: TestClient;
  let member: TestClient;
  let folderId: string;
  let folderChildId: string;
  let visibleDocId: string;
  let hiddenDocId: string;

  const namespaceId = () => owner.namespace.id;
  const expandUrl = () =>
    `/internal/api/v1/namespaces/${namespaceId()}/resources/visible-expanded`;
  const expand = (client: TestClient, resources: unknown[]) =>
    client
      .request()
      .post(expandUrl())
      .set('X-User-ID', client.user.id)
      .send({ resources });

  const createResource = async (
    client: TestClient,
    name: string,
    resourceType: ResourceType,
    parentId: string,
  ) =>
    (
      await client
        .post(`/api/v1/namespaces/${namespaceId()}/resources`)
        .send({ name, resourceType, parentId })
        .expect(HttpStatus.CREATED)
    ).body as { id: string };

  beforeAll(async () => {
    owner = await TestClient.create();
    member = await TestClient.create();

    const invitation = await owner
      .post(`/api/v1/namespaces/${namespaceId()}/invitations`)
      .send({
        namespaceRole: 'member',
        rootPermission: ResourcePermission.CAN_VIEW,
      })
      .expect(HttpStatus.CREATED);
    await member
      .post(
        `/api/v1/namespaces/${namespaceId()}/invitations/${invitation.body.id}/accept`,
      )
      .expect(HttpStatus.CREATED);

    folderId = (
      await createResource(
        owner,
        'Visible expanded folder',
        ResourceType.FOLDER,
        owner.namespace.root_resource_id,
      )
    ).id;
    folderChildId = (
      await createResource(
        owner,
        'Folder child doc',
        ResourceType.DOC,
        folderId,
      )
    ).id;
    visibleDocId = (
      await createResource(
        owner,
        'Visible expanded doc',
        ResourceType.DOC,
        owner.namespace.root_resource_id,
      )
    ).id;
    hiddenDocId = (
      await createResource(
        owner,
        'Hidden expanded doc',
        ResourceType.DOC,
        owner.namespace.root_resource_id,
      )
    ).id;

    await owner
      .patch(
        `/api/v1/namespaces/${namespaceId()}/resources/${hiddenDocId}/permissions/users/${member.user.id}`,
      )
      .send({ permission: ResourcePermission.NO_ACCESS })
      .expect(HttpStatus.OK);
  });

  afterAll(async () => {
    await member?.close();
    await owner?.close();
  });

  it('expands an attached folder to its visible children', async () => {
    const response = await expand(member, [
      { id: folderId, name: 'Visible expanded folder', type: 'folder' },
    ]).expect(HttpStatus.OK);

    expect(response.body.resources).toEqual(
      expect.arrayContaining([
        {
          id: folderId,
          name: 'Visible expanded folder',
          type: 'folder',
          child_ids: [folderChildId],
        },
        {
          id: folderChildId,
          name: 'Folder child doc',
          type: 'resource',
        },
      ]),
    );
  });

  it('returns every reachable resource for an empty attachment list', async () => {
    const response = await expand(member, []).expect(HttpStatus.OK);
    const ids = response.body.resources.map(
      (resource: { id: string }) => resource.id,
    );

    expect(ids).toEqual(
      expect.arrayContaining([folderId, folderChildId, visibleDocId]),
    );
    expect(ids).not.toContain(hiddenDocId);
    for (const resource of response.body.resources) {
      expect(resource).toEqual({
        id: expect.any(String),
        name: expect.any(String),
        type: expect.stringMatching(/^(resource|folder)$/),
      });
    }
  });

  it('filters an attached resource the user cannot view', async () => {
    const response = await expand(member, [
      { id: hiddenDocId, name: 'Hidden expanded doc', type: 'resource' },
    ]).expect(HttpStatus.OK);

    expect(response.body.resources).toEqual([]);
  });

  it("does not apply a member's access rules to the owner", async () => {
    const response = await expand(owner, []).expect(HttpStatus.OK);
    const ids = response.body.resources.map(
      (resource: { id: string }) => resource.id,
    );

    expect(ids).toContain(hiddenDocId);
  });

  it('requires the internal user header', async () => {
    const response = await owner
      .request()
      .post(expandUrl())
      .send({ resources: [] })
      .expect(HttpStatus.UNAUTHORIZED);

    expect(response.body.code).toBe('not_authorized');
  });
});
