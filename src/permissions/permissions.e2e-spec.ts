import { TestClient } from 'test/test-client';
import { HttpStatus } from '@nestjs/common';
import { ResourcePermission } from './resource-permission.enum';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';

describe('PermissionsController (e2e)', () => {
  let client: TestClient;
  let testResourceId: string;
  let testGroupId: string;
  let secondUserClient: TestClient;

  beforeAll(async () => {
    client = await TestClient.create();

    // Create a second user for testing user permissions
    secondUserClient = await TestClient.create();

    // Create a test resource (folder) for permission testing
    const createResourceResponse = await client
      .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
      .send({
        name: 'Test Permissions Folder',
        namespaceId: client.namespace.id,
        resourceType: ResourceType.FOLDER,
        parentId: client.namespace.root_resource_id,
        content: '',
        tags: [],
        attrs: {},
      })
      .expect(HttpStatus.CREATED);

    testResourceId = createResourceResponse.body.id;

    // Create a test group
    const createGroupResponse = await client
      .post(`/api/v1/namespaces/${client.namespace.id}/groups`)
      .send({
        title: 'Test Permissions Group',
      })
      .expect(HttpStatus.CREATED);

    testGroupId = createGroupResponse.body.id;

    // Note: We can't add the second user to the group because they're not a member of this namespace
    // We'll test with the current user and non-existent user IDs
  });

  afterAll(async () => {
    await client.close();
    await secondUserClient.close();
  });

  describe('GET /permissions', () => {
    it('should list permissions for a resource', async () => {
      const response = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/permissions`,
        )
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('global_permission');
      expect(response.body).toHaveProperty('users');
      expect(response.body).toHaveProperty('groups');
      expect(Array.isArray(response.body.users)).toBe(true);
      expect(Array.isArray(response.body.groups)).toBe(true);
    });

    it('should return 403 for unauthorized user', async () => {
      // Use the second user who is not in the first user's namespace
      await secondUserClient
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/permissions`,
        )
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should return 404 for non-existent resource', async () => {
      await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/nonexistent/permissions`,
        )
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('PATCH /permissions (global)', () => {
    it('should update global permission for a resource', async () => {
      await client
        .patch(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/permissions`,
        )
        .send({
          permission: ResourcePermission.CAN_VIEW,
        })
        .expect(HttpStatus.OK);

      // Verify the permission was updated
      const response = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/permissions`,
        )
        .expect(HttpStatus.OK);

      expect(response.body.global_permission).toBe(ResourcePermission.CAN_VIEW);
    });

    it('should reject invalid permission values', async () => {
      await client
        .patch(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/permissions`,
        )
        .send({
          permission: 'invalid_permission',
        })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should return 403 for unauthorized user', async () => {
      await secondUserClient
        .patch(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/permissions`,
        )
        .send({
          permission: ResourcePermission.CAN_EDIT,
        })
        .expect(HttpStatus.FORBIDDEN);
    });
  });

  describe('PATCH /permissions/groups/:groupId', () => {
    it('should update group permission for a resource', async () => {
      await client
        .patch(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/permissions/groups/${testGroupId}`,
        )
        .send({
          permission: ResourcePermission.CAN_EDIT,
        })
        .expect(HttpStatus.OK);

      // Verify the permission was updated
      const response = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/permissions`,
        )
        .expect(HttpStatus.OK);

      const groupPermission = response.body.groups.find(
        (g: any) => g.group.id === testGroupId,
      );
      expect(groupPermission).toBeDefined();
      expect(groupPermission.permission).toBe(ResourcePermission.CAN_EDIT);
    });

    it('should return 403 for unauthorized user', async () => {
      await secondUserClient
        .patch(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/permissions/groups/${testGroupId}`,
        )
        .send({
          permission: ResourcePermission.FULL_ACCESS,
        })
        .expect(HttpStatus.FORBIDDEN);
    });
  });

  describe('DELETE /permissions/groups/:groupId', () => {
    it('should delete group permission for a resource', async () => {
      // First set a permission
      await client
        .patch(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/permissions/groups/${testGroupId}`,
        )
        .send({
          permission: ResourcePermission.CAN_COMMENT,
        })
        .expect(HttpStatus.OK);

      // Then delete it
      await client
        .delete(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/permissions/groups/${testGroupId}`,
        )
        .expect(HttpStatus.OK);

      // Verify the permission was removed
      const response = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/permissions`,
        )
        .expect(HttpStatus.OK);

      const groupPermission = response.body.groups.find(
        (g: any) => g.group.id === testGroupId,
      );
      // After deletion, the group should not appear in the list or have no_access permission
      expect(groupPermission?.permission || ResourcePermission.NO_ACCESS).toBe(
        ResourcePermission.NO_ACCESS,
      );
    });
  });

  describe('PATCH /permissions/users/:userId', () => {
    it('should update user permission for a resource', async () => {
      await client
        .patch(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/permissions/users/${client.user.id}`,
        )
        .send({
          permission: ResourcePermission.FULL_ACCESS,
        })
        .expect(HttpStatus.OK);

      // Verify the permission was updated
      const response = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/permissions`,
        )
        .expect(HttpStatus.OK);

      const userPermission = response.body.users.find(
        (u: any) => u.user.id === client.user.id,
      );
      expect(userPermission).toBeDefined();
      expect(userPermission.permission).toBe(ResourcePermission.FULL_ACCESS);
    });
  });

  describe('DELETE /permissions/users/:userId', () => {
    it('should delete user permission for a resource', async () => {
      // Get initial permissions to see what the user's permission is before we set it
      const initialResponse = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/permissions`,
        )
        .expect(HttpStatus.OK);

      const initialUserPermission = initialResponse.body.users.find(
        (u: any) => u.user.id === client.user.id,
      );
      const initialPermission =
        initialUserPermission?.permission || ResourcePermission.NO_ACCESS;

      // Set a different permission
      await client
        .patch(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/permissions/users/${client.user.id}`,
        )
        .send({
          permission: ResourcePermission.CAN_VIEW,
        })
        .expect(HttpStatus.OK);

      // Verify the permission was set
      const afterSetResponse = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/permissions`,
        )
        .expect(HttpStatus.OK);

      const afterSetUserPermission = afterSetResponse.body.users.find(
        (u: any) => u.user.id === client.user.id,
      );
      expect(afterSetUserPermission.permission).toBe(
        ResourcePermission.CAN_VIEW,
      );

      // Then delete it
      await client
        .delete(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/permissions/users/${client.user.id}`,
        )
        .expect(HttpStatus.OK);

      // Verify the permission was removed/reset
      const afterDeleteResponse = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/permissions`,
        )
        .expect(HttpStatus.OK);

      const afterDeleteUserPermission = afterDeleteResponse.body.users.find(
        (u: any) => u.user.id === client.user.id,
      );

      if (afterDeleteUserPermission) {
        // If the user still appears, they should have their original permission (likely from ownership)
        // The delete operation should have removed the explicit permission, reverting to the inherited permission
        expect(afterDeleteUserPermission.permission).toBe(initialPermission);
      }
      // If the user doesn't appear, that means they have no explicit permissions (also acceptable)
    });
  });

  describe('Permission hierarchy and inheritance', () => {
    let childResourceId: string;

    beforeAll(async () => {
      // Create a child resource under the test resource
      const createChildResponse = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .send({
          name: 'Child Resource',
          namespaceId: client.namespace.id,
          resourceType: ResourceType.DOC,
          parentId: testResourceId,
          content: 'Test content',
          tags: [],
          attrs: {},
        })
        .expect(HttpStatus.CREATED);

      childResourceId = createChildResponse.body.id;
    });

    it('should inherit permissions from parent resource', async () => {
      // Set global permission on parent
      await client
        .patch(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/permissions`,
        )
        .send({
          permission: ResourcePermission.CAN_EDIT,
        })
        .expect(HttpStatus.OK);

      // Check permissions on child resource
      const response = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/${childResourceId}/permissions`,
        )
        .expect(HttpStatus.OK);

      expect(response.body.global_permission).toBe(ResourcePermission.CAN_EDIT);
    });

    it('should prioritize user permissions over group permissions', async () => {
      // Set group permission
      await client
        .patch(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/permissions/groups/${testGroupId}`,
        )
        .send({
          permission: ResourcePermission.CAN_VIEW,
        })
        .expect(HttpStatus.OK);

      // Set user permission (higher priority)
      await client
        .patch(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/permissions/users/${client.user.id}`,
        )
        .send({
          permission: ResourcePermission.FULL_ACCESS,
        })
        .expect(HttpStatus.OK);

      // Verify user permission takes precedence
      const response = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/permissions`,
        )
        .expect(HttpStatus.OK);

      const userPermission = response.body.users.find(
        (u: any) => u.user.id === client.user.id,
      );
      expect(userPermission.permission).toBe(ResourcePermission.FULL_ACCESS);
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle non-existent group ID', async () => {
      await client
        .patch(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/permissions/groups/nonexistent`,
        )
        .send({
          permission: ResourcePermission.CAN_VIEW,
        })
        .expect(HttpStatus.INTERNAL_SERVER_ERROR); // Database constraint violation
    });

    it('should handle non-existent user ID', async () => {
      await client
        .patch(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/permissions/users/nonexistent`,
        )
        .send({
          permission: ResourcePermission.CAN_VIEW,
        })
        .expect(HttpStatus.INTERNAL_SERVER_ERROR); // Database constraint violation
    });

    it('should validate permission enum values', async () => {
      const invalidPermissions = ['invalid', '', null, undefined];

      for (const invalidPermission of invalidPermissions) {
        await client
          .patch(
            `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/permissions`,
          )
          .send({
            permission: invalidPermission,
          })
          .expect(HttpStatus.BAD_REQUEST);
      }
    });

    it('should handle missing request body', async () => {
      await client
        .patch(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/permissions`,
        )
        .send({})
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should handle cross-namespace access attempts', async () => {
      // Use the second user's existing namespace instead of creating a new one
      const secondNamespaceId = secondUserClient.namespace.id;

      // Try to access permissions from first namespace using second namespace ID
      await client
        .get(
          `/api/v1/namespaces/${secondNamespaceId}/resources/${testResourceId}/permissions`,
        )
        .expect(HttpStatus.FORBIDDEN);
    });
  });

  describe('Permission levels validation', () => {
    it('should accept all valid permission levels', async () => {
      const validPermissions = [
        ResourcePermission.NO_ACCESS,
        ResourcePermission.CAN_VIEW,
        ResourcePermission.CAN_COMMENT,
        ResourcePermission.CAN_EDIT,
        ResourcePermission.FULL_ACCESS,
      ];

      for (const permission of validPermissions) {
        await client
          .patch(
            `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/permissions`,
          )
          .send({
            permission,
          })
          .expect(HttpStatus.OK);

        // Verify the permission was set
        const response = await client
          .get(
            `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/permissions`,
          )
          .expect(HttpStatus.OK);

        expect(response.body.global_permission).toBe(permission);
      }
    });
  });
});
