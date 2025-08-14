import { TestClient } from 'test/test-client';
import { HttpStatus } from '@nestjs/common';

describe('GroupsController (e2e)', () => {
  let client: TestClient;
  let secondClient: TestClient;
  let testGroupId: string;

  beforeAll(async () => {
    client = await TestClient.create();
    secondClient = await TestClient.create();
  });

  afterAll(async () => {
    await client.close();
    await secondClient.close();
  });

  describe('POST /api/v1/namespaces/:namespaceId/groups', () => {
    it('should create a new group', async () => {
      const createGroupDto = {
        title: 'Test Group',
      };

      const response = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/groups`)
        .send(createGroupDto)
        .expect(HttpStatus.CREATED);

      expect(response.body).toHaveProperty('id');
      expect(response.body.title).toBe(createGroupDto.title);
      expect(response.body.namespace_id).toBe(client.namespace.id);

      testGroupId = response.body.id;
    });

    it('should fail to create group with empty title', async () => {
      const createGroupDto = {
        title: '',
      };

      await client
        .post(`/api/v1/namespaces/${client.namespace.id}/groups`)
        .send(createGroupDto)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should fail to create group with missing title', async () => {
      const createGroupDto = {};

      await client
        .post(`/api/v1/namespaces/${client.namespace.id}/groups`)
        .send(createGroupDto)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should fail to create group in namespace user does not own', async () => {
      const createGroupDto = {
        title: 'Unauthorized Group',
      };

      await secondClient
        .post(`/api/v1/namespaces/${client.namespace.id}/groups`)
        .send(createGroupDto)
        .expect(HttpStatus.FORBIDDEN);
    });
  });

  describe('GET /api/v1/namespaces/:namespaceId/groups', () => {
    it('should list groups in namespace', async () => {
      const response = await client
        .get(`/api/v1/namespaces/${client.namespace.id}/groups`)
        .expect(HttpStatus.OK);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);

      const group = response.body.find((g: any) => g.id === testGroupId);
      expect(group).toBeDefined();
      expect(group.title).toBe('Test Group');
      expect(group.namespace_id).toBe(client.namespace.id);
    });

    it('should fail to list groups in namespace user does not own', async () => {
      await secondClient
        .get(`/api/v1/namespaces/${client.namespace.id}/groups`)
        .expect(HttpStatus.FORBIDDEN);
    });
  });

  describe('PATCH /api/v1/namespaces/:namespaceId/groups/:groupId', () => {
    it('should update group title', async () => {
      const updateGroupDto = {
        title: 'Updated Test Group',
      };

      const response = await client
        .patch(
          `/api/v1/namespaces/${client.namespace.id}/groups/${testGroupId}`,
        )
        .send(updateGroupDto)
        .expect(HttpStatus.OK);

      expect(response.body.id).toBe(testGroupId);
      expect(response.body.title).toBe(updateGroupDto.title);
      expect(response.body.namespace_id).toBe(client.namespace.id);
    });

    it('should fail to update group with empty title', async () => {
      const updateGroupDto = {
        title: '',
      };

      await client
        .patch(
          `/api/v1/namespaces/${client.namespace.id}/groups/${testGroupId}`,
        )
        .send(updateGroupDto)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should fail to update group in namespace user does not own', async () => {
      const updateGroupDto = {
        title: 'Unauthorized Update',
      };

      await secondClient
        .patch(
          `/api/v1/namespaces/${client.namespace.id}/groups/${testGroupId}`,
        )
        .send(updateGroupDto)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should fail to update non-existent group', async () => {
      const updateGroupDto = {
        title: 'Non-existent Group',
      };

      await client
        .patch(`/api/v1/namespaces/${client.namespace.id}/groups/nonexistent`)
        .send(updateGroupDto)
        .expect(HttpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  describe('POST /api/v1/namespaces/:namespaceId/groups/:groupId/users', () => {
    it('should add users to group', async () => {
      const addGroupUserDto = {
        userIds: [secondClient.user.id],
      };

      await client
        .post(
          `/api/v1/namespaces/${client.namespace.id}/groups/${testGroupId}/users`,
        )
        .send(addGroupUserDto)
        .expect(HttpStatus.CREATED);
    });

    it('should handle empty userIds array', async () => {
      const addGroupUserDto = {
        userIds: [],
      };

      await client
        .post(
          `/api/v1/namespaces/${client.namespace.id}/groups/${testGroupId}/users`,
        )
        .send(addGroupUserDto)
        .expect(HttpStatus.CREATED);
    });

    it('should fail to add users to group in namespace user does not own', async () => {
      const addGroupUserDto = {
        userIds: [client.user.id],
      };

      await secondClient
        .post(
          `/api/v1/namespaces/${client.namespace.id}/groups/${testGroupId}/users`,
        )
        .send(addGroupUserDto)
        .expect(HttpStatus.FORBIDDEN);
    });
  });

  describe('GET /api/v1/namespaces/:namespaceId/groups/:groupId/users', () => {
    it('should list users in group', async () => {
      const response = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/groups/${testGroupId}/users`,
        )
        .expect(HttpStatus.OK);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);

      const user = response.body.find(
        (u: any) => u.id === secondClient.user.id,
      );
      expect(user).toBeDefined();
      expect(user.email).toBe(secondClient.user.email);
    });

    it('should fail to list users in group in namespace user does not own', async () => {
      await secondClient
        .get(
          `/api/v1/namespaces/${client.namespace.id}/groups/${testGroupId}/users`,
        )
        .expect(HttpStatus.FORBIDDEN);
    });
  });

  describe('DELETE /api/v1/namespaces/:namespaceId/groups/:groupId/users/:userId', () => {
    it('should remove user from group', async () => {
      await client
        .delete(
          `/api/v1/namespaces/${client.namespace.id}/groups/${testGroupId}/users/${secondClient.user.id}`,
        )
        .expect(HttpStatus.OK);

      // Verify user was removed
      const response = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/groups/${testGroupId}/users`,
        )
        .expect(HttpStatus.OK);

      const user = response.body.find(
        (u: any) => u.id === secondClient.user.id,
      );
      expect(user).toBeUndefined();
    });

    it('should fail to remove user from group in namespace user does not own', async () => {
      await secondClient
        .delete(
          `/api/v1/namespaces/${client.namespace.id}/groups/${testGroupId}/users/${client.user.id}`,
        )
        .expect(HttpStatus.FORBIDDEN);
    });
  });

  describe('DELETE /api/v1/namespaces/:namespaceId/groups/:groupId', () => {
    it('should fail to delete group in namespace user does not own', async () => {
      await secondClient
        .delete(
          `/api/v1/namespaces/${client.namespace.id}/groups/${testGroupId}`,
        )
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should delete group', async () => {
      await client
        .delete(
          `/api/v1/namespaces/${client.namespace.id}/groups/${testGroupId}`,
        )
        .expect(HttpStatus.OK);

      // Verify group was deleted
      const response = await client
        .get(`/api/v1/namespaces/${client.namespace.id}/groups`)
        .expect(HttpStatus.OK);

      const group = response.body.find((g: any) => g.id === testGroupId);
      expect(group).toBeUndefined();
    });

    it('should succeed to delete non-existent group (soft delete behavior)', async () => {
      await client
        .delete(`/api/v1/namespaces/${client.namespace.id}/groups/nonexistent`)
        .expect(HttpStatus.OK);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    let edgeTestGroupId: string;

    beforeAll(async () => {
      // Create a group for edge case testing
      const response = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/groups`)
        .send({ title: 'Edge Test Group' })
        .expect(HttpStatus.CREATED);

      edgeTestGroupId = response.body.id;
    });

    afterAll(async () => {
      // Clean up edge test group
      await client
        .delete(
          `/api/v1/namespaces/${client.namespace.id}/groups/${edgeTestGroupId}`,
        )
        .catch(() => {}); // Ignore errors if already deleted
    });

    it('should handle special characters in group title', async () => {
      const specialTitleGroup = {
        title: 'Test Group with 特殊字符 and émojis 🚀',
      };

      const response = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/groups`)
        .send(specialTitleGroup)
        .expect(HttpStatus.CREATED);

      expect(response.body.title).toBe(specialTitleGroup.title);

      // Clean up
      await client
        .delete(
          `/api/v1/namespaces/${client.namespace.id}/groups/${response.body.id}`,
        )
        .expect(HttpStatus.OK);
    });

    it('should handle adding duplicate users to group', async () => {
      // Add user first time
      await client
        .post(
          `/api/v1/namespaces/${client.namespace.id}/groups/${edgeTestGroupId}/users`,
        )
        .send({ userIds: [secondClient.user.id] })
        .expect(HttpStatus.CREATED);

      // Add same user again - should not fail
      await client
        .post(
          `/api/v1/namespaces/${client.namespace.id}/groups/${edgeTestGroupId}/users`,
        )
        .send({ userIds: [secondClient.user.id] })
        .expect(HttpStatus.CREATED);
    });

    it('should fail when removing user with invalid UUID format', async () => {
      await client
        .delete(
          `/api/v1/namespaces/${client.namespace.id}/groups/${edgeTestGroupId}/users/nonexistent`,
        )
        .expect(HttpStatus.INTERNAL_SERVER_ERROR);
    });
  });
});
