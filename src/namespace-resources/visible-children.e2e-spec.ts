import { HttpStatus } from '@nestjs/common';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import { TestClient } from 'test/test-client';

describe('Visible child markers (e2e)', () => {
  let owner: TestClient;
  let member: TestClient;

  beforeAll(async () => {
    owner = await TestClient.create();
    member = await TestClient.create();

    const invitation = await owner
      .post(`/api/v1/namespaces/${owner.namespace.id}/invitations`)
      .send({
        namespaceRole: 'member',
        rootPermission: ResourcePermission.CAN_VIEW,
      })
      .expect(HttpStatus.CREATED);
    await member
      .post(
        `/api/v1/namespaces/${owner.namespace.id}/invitations/${invitation.body.id}/accept`,
      )
      .expect(HttpStatus.CREATED);
  });

  afterAll(async () => {
    await member?.close();
    await owner?.close();
  });

  it('marks only parents with at least one visible direct child', async () => {
    const createResource = async (
      name: string,
      resourceType: ResourceType,
      parentId: string,
    ) =>
      (
        await owner
          .post(`/api/v1/namespaces/${owner.namespace.id}/resources`)
          .send({ name, resourceType, parentId })
          .expect(HttpStatus.CREATED)
      ).body as { id: string };

    const container = await createResource(
      'Visibility container',
      ResourceType.FOLDER,
      owner.namespace.root_resource_id,
    );
    const visibleParent = await createResource(
      'Visible child parent',
      ResourceType.FOLDER,
      container.id,
    );
    const hiddenOnlyParent = await createResource(
      'Hidden-only child parent',
      ResourceType.FOLDER,
      container.id,
    );
    await createResource(
      'Visible grandchild',
      ResourceType.DOC,
      visibleParent.id,
    );
    const hiddenGrandchild = await createResource(
      'Hidden grandchild',
      ResourceType.DOC,
      hiddenOnlyParent.id,
    );

    await owner
      .patch(
        `/api/v1/namespaces/${owner.namespace.id}/resources/${hiddenGrandchild.id}/permissions/users/${member.user.id}`,
      )
      .send({ permission: ResourcePermission.NO_ACCESS })
      .expect(HttpStatus.OK);

    const response = await member
      .get(
        `/api/v1/namespaces/${owner.namespace.id}/resources/${container.id}/children?sort_by=title&sort_order=asc`,
      )
      .expect(HttpStatus.OK);
    const hasChildrenById = new Map<string, boolean>(
      response.body.map((resource: { id: string; has_children: boolean }) => [
        resource.id,
        resource.has_children,
      ]),
    );

    expect(hasChildrenById.get(visibleParent.id)).toBe(true);
    expect(hasChildrenById.get(hiddenOnlyParent.id)).toBe(false);
  });
});
