import { HttpStatus } from '@nestjs/common';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import { TestClient } from 'test/test-client';

describe('Visible child markers (e2e)', () => {
  let owner: TestClient;
  let member: TestClient;
  let firstGroupId: string;
  let secondGroupId: string;

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

    const createGroup = async (title: string) => {
      const response = await owner
        .post(`/api/v1/namespaces/${owner.namespace.id}/groups`)
        .send({ title })
        .expect(HttpStatus.CREATED);
      await owner
        .post(
          `/api/v1/namespaces/${owner.namespace.id}/groups/${response.body.id}/users`,
        )
        .send({ userIds: [member.user.id] })
        .expect(HttpStatus.CREATED);
      return response.body.id as string;
    };
    firstGroupId = await createGroup('Visible child group 1');
    secondGroupId = await createGroup('Visible child group 2');
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
      ResourceType.DOC,
      container.id,
    );
    const hiddenOnlyParent = await createResource(
      'Hidden-only child parent',
      ResourceType.FOLDER,
      container.id,
    );
    const globalGrantParent = await createResource(
      'Global grant parent',
      ResourceType.FOLDER,
      container.id,
    );
    const groupGrantParent = await createResource(
      'Group grant parent',
      ResourceType.FOLDER,
      container.id,
    );
    const mixedGroupParent = await createResource(
      'Mixed group parent',
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
    const globalGrantGrandchild = await createResource(
      'Global grant grandchild',
      ResourceType.DOC,
      globalGrantParent.id,
    );
    const groupGrantGrandchild = await createResource(
      'Group grant grandchild',
      ResourceType.DOC,
      groupGrantParent.id,
    );
    const mixedGroupGrandchild = await createResource(
      'Mixed group grandchild',
      ResourceType.DOC,
      mixedGroupParent.id,
    );

    const setUserPermission = async (
      resourceId: string,
      permission: ResourcePermission,
    ) => {
      await owner
        .patch(
          `/api/v1/namespaces/${owner.namespace.id}/resources/${resourceId}/permissions/users/${member.user.id}`,
        )
        .send({ permission })
        .expect(HttpStatus.OK);
    };
    const setGroupPermission = async (
      resourceId: string,
      groupId: string,
      permission: ResourcePermission,
    ) => {
      await owner
        .patch(
          `/api/v1/namespaces/${owner.namespace.id}/resources/${resourceId}/permissions/groups/${groupId}`,
        )
        .send({ permission })
        .expect(HttpStatus.OK);
    };

    await Promise.all([
      setUserPermission(hiddenGrandchild.id, ResourcePermission.NO_ACCESS),
      setUserPermission(globalGrantGrandchild.id, ResourcePermission.NO_ACCESS),
      setUserPermission(groupGrantGrandchild.id, ResourcePermission.NO_ACCESS),
      setUserPermission(mixedGroupGrandchild.id, ResourcePermission.NO_ACCESS),
      owner
        .patch(
          `/api/v1/namespaces/${owner.namespace.id}/resources/${globalGrantParent.id}/permissions`,
        )
        .send({ permission: ResourcePermission.CAN_VIEW })
        .expect(HttpStatus.OK),
      setGroupPermission(
        groupGrantParent.id,
        firstGroupId,
        ResourcePermission.CAN_VIEW,
      ),
      setGroupPermission(
        mixedGroupGrandchild.id,
        firstGroupId,
        ResourcePermission.NO_ACCESS,
      ),
      setGroupPermission(
        mixedGroupGrandchild.id,
        secondGroupId,
        ResourcePermission.CAN_VIEW,
      ),
    ]);

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
    // A user-level no_access rule on the child overrides inherited global
    // access, so this parent has no visible direct child for this member.
    expect(hasChildrenById.get(globalGrantParent.id)).toBe(false);
    expect(hasChildrenById.get(groupGrantParent.id)).toBe(true);
    expect(hasChildrenById.get(mixedGroupParent.id)).toBe(true);
  });
});
