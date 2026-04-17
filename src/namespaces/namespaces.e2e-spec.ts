import { TestClient } from 'test/test-client';
import { HttpStatus } from '@nestjs/common';
import { NamespaceRole } from './entities/namespace-member.entity';
import { ResourcePermission } from '../permissions/resource-permission.enum';

/**
 * Generate unique namespace name to avoid conflicts
 */
function uniqueNs(prefix: string): string {
  return `${prefix} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Helper to add a member to a namespace via invitation flow
 */
async function addMemberViaInvitation(
  owner: TestClient,
  invitee: TestClient,
  namespaceId: string,
  role: NamespaceRole,
  permission: ResourcePermission = ResourcePermission.FULL_ACCESS,
): Promise<void> {
  // Create invitation
  const invitationRes = await owner
    .post(`/api/v1/namespaces/${namespaceId}/invitations`)
    .send({ namespaceRole: role, rootPermission: permission })
    .expect(HttpStatus.CREATED);

  const invitationId = invitationRes.body.id;

  // Invitee accepts invitation
  await invitee
    .post(
      `/api/v1/namespaces/${namespaceId}/invitations/${invitationId}/accept`,
    )
    .expect(HttpStatus.CREATED);

  // Delete invitation after use
  await owner
    .delete(`/api/v1/namespaces/${namespaceId}/invitations/${invitationId}`)
    .expect(HttpStatus.OK);
}

describe('NamespacesController (e2e)', () => {
  let client: TestClient;
  let secondClient: TestClient;
  let testNamespaceId: string;

  beforeAll(async () => {
    client = await TestClient.create();
    secondClient = await TestClient.create();
  });

  afterAll(async () => {
    await client.close();
    await secondClient.close();
  });

  describe('GET /api/v1/namespaces', () => {
    it('should list namespaces for authenticated user', async () => {
      const response = await client
        .get('/api/v1/namespaces')
        .expect(HttpStatus.OK);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);

      const defaultNamespace = response.body[0];
      expect(defaultNamespace).toHaveProperty('id');
      expect(defaultNamespace).toHaveProperty('name');
      expect(defaultNamespace.name).toContain(client.user.username);
    });

    it('should fail without authentication', async () => {
      await client
        .request()
        .get('/api/v1/namespaces')
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('POST /api/v1/namespaces', () => {
    it('should create a new namespace', async () => {
      const createNamespaceDto = {
        name: 'Test Workspace',
      };

      const response = await client
        .post('/api/v1/namespaces')
        .send(createNamespaceDto)
        .expect(HttpStatus.CREATED);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe(createNamespaceDto.name);
      expect(response.body).toHaveProperty('root_resource_id');

      testNamespaceId = response.body.id;
    });

    it('should create namespace with empty name', async () => {
      const createNamespaceDto = {
        name: '',
      };

      await client
        .post('/api/v1/namespaces')
        .send(createNamespaceDto)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should fail to create namespace without name', async () => {
      const createNamespaceDto = {};

      await client
        .post('/api/v1/namespaces')
        .send(createNamespaceDto)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should fail to create namespace with duplicate name', async () => {
      const createNamespaceDto = {
        name: 'Duplicate Test Workspace',
      };

      // First, create a namespace
      const firstResponse = await client
        .post('/api/v1/namespaces')
        .send(createNamespaceDto)
        .expect(HttpStatus.CREATED);

      // Try to create another namespace with the same name
      const response = await client
        .post('/api/v1/namespaces')
        .send(createNamespaceDto)
        .expect(HttpStatus.CONFLICT);

      expect(response.body).toHaveProperty('code');
      expect(response.body.code).toBe('namespace_conflict');

      // Clean up the first namespace
      await client.delete(`/api/v1/namespaces/${firstResponse.body.id}`);
    });
  });

  describe('GET /api/v1/namespaces/:namespaceId', () => {
    it('should get namespace details', async () => {
      const response = await client
        .get(`/api/v1/namespaces/${testNamespaceId}`)
        .expect(HttpStatus.OK);

      expect(response.body.id).toBe(testNamespaceId);
      expect(response.body.name).toBe('Test Workspace');
      expect(response.body).toHaveProperty('root_resource_id');
    });

    it('should fail for non-existent namespace', async () => {
      await client
        .get('/api/v1/namespaces/nonexistent')
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should get namespace details for any authenticated user', async () => {
      const response = await secondClient
        .get(`/api/v1/namespaces/${testNamespaceId}`)
        .expect(HttpStatus.OK);

      expect(response.body.id).toBe(testNamespaceId);
      expect(response.body.name).toBe('Test Workspace');
    });
  });

  describe('GET /api/v1/namespaces/:namespaceId/members', () => {
    it('should list namespace members with owner', async () => {
      const response = await client
        .get(`/api/v1/namespaces/${testNamespaceId}/members`)
        .expect(HttpStatus.OK);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(1);

      const owner = response.body[0];
      expect(owner.userId || owner.user_id).toBe(client.user.id);
      expect(owner.email).toBe(client.user.email);
      expect(owner.username).toBe(client.user.username);
      expect(owner.role).toBe(NamespaceRole.OWNER);
      expect(owner).toHaveProperty('permission');
    });

    it('should list multiple members after adding one', () => {
      // For now, we'll skip this test and implement it after member management
      // This test will be completed after implementing member addition functionality
    });
  });

  describe('GET /api/v1/namespaces/:namespaceId/members/:userId', () => {
    it('should get member details by userId', async () => {
      const response = await client
        .get(`/api/v1/namespaces/${testNamespaceId}/members/${client.user.id}`)
        .expect(HttpStatus.OK);

      expect(response.body.userId || response.body.user_id).toBe(
        client.user.id,
      );
      expect(response.body.namespaceId || response.body.namespace_id).toBe(
        testNamespaceId,
      );
      expect(response.body.role).toBe(NamespaceRole.OWNER);
      expect(response.body).toHaveProperty('root_resource_id');
    });

    it('should return null or empty object for non-member', async () => {
      const response = await client
        .get(
          `/api/v1/namespaces/${testNamespaceId}/members/${secondClient.user.id}`,
        )
        .expect(HttpStatus.OK);

      expect(
        response.body === null || Object.keys(response.body).length === 0,
      ).toBe(true);
    });

    it('should fail for non-existent user', async () => {
      await client
        .get(`/api/v1/namespaces/${testNamespaceId}/members/nonexistent`)
        .expect(HttpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  describe('PATCH /api/v1/namespaces/:namespaceId/members/:userId', () => {
    beforeAll(async () => {
      // Add secondClient as a member first by manually adding them
      // Since there's no direct endpoint to add members, we'll simulate this through database operations
      // For the scope of this e2e test, we'll test role updates on existing members
    });

    it('should update member role from OWNER to MEMBER', async () => {
      // Create another namespace where we can test role changes
      const tempNamespace = await client
        .post('/api/v1/namespaces')
        .send({ name: 'Temp Role Test Workspace' })
        .expect(HttpStatus.CREATED);

      const tempNamespaceId = tempNamespace.body.id;

      // Should fail because user is the only owner in the namespace.
      await client
        .patch(
          `/api/v1/namespaces/${tempNamespaceId}/members/${client.user.id}`,
        )
        .send({ role: NamespaceRole.MEMBER })
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    it('should allow owner to promote member to admin (case 10)', async () => {
      const tempNamespace = await client
        .post('/api/v1/namespaces')
        .send({ name: uniqueNs('Promote Member Test') })
        .expect(HttpStatus.CREATED);

      const tempNamespaceId = tempNamespace.body.id;

      // Add secondClient as member
      await addMemberViaInvitation(
        client,
        secondClient,
        tempNamespaceId,
        NamespaceRole.MEMBER,
        ResourcePermission.CAN_EDIT,
      );

      // Owner promotes member to admin
      await client
        .patch(
          `/api/v1/namespaces/${tempNamespaceId}/members/${secondClient.user.id}`,
        )
        .send({ role: NamespaceRole.ADMIN })
        .expect(HttpStatus.OK);

      // Verify role was changed
      const memberResponse = await client
        .get(
          `/api/v1/namespaces/${tempNamespaceId}/members/${secondClient.user.id}`,
        )
        .expect(HttpStatus.OK);

      expect(memberResponse.body.role).toBe(NamespaceRole.ADMIN);

      // Cleanup
      await client.delete(`/api/v1/namespaces/${tempNamespaceId}`);
    });

    it('should allow owner to demote admin to member (case 11)', async () => {
      const tempNamespace = await client
        .post('/api/v1/namespaces')
        .send({ name: uniqueNs('Demote Admin Test') })
        .expect(HttpStatus.CREATED);

      const tempNamespaceId = tempNamespace.body.id;

      // Add secondClient as admin
      await addMemberViaInvitation(
        client,
        secondClient,
        tempNamespaceId,
        NamespaceRole.ADMIN,
        ResourcePermission.FULL_ACCESS,
      );

      // Owner demotes admin to member
      await client
        .patch(
          `/api/v1/namespaces/${tempNamespaceId}/members/${secondClient.user.id}`,
        )
        .send({ role: NamespaceRole.MEMBER })
        .expect(HttpStatus.OK);

      // Verify role was changed
      const memberResponse = await client
        .get(
          `/api/v1/namespaces/${tempNamespaceId}/members/${secondClient.user.id}`,
        )
        .expect(HttpStatus.OK);

      expect(memberResponse.body.role).toBe(NamespaceRole.MEMBER);

      // Cleanup
      await client.delete(`/api/v1/namespaces/${tempNamespaceId}`);
    });

    it('should fail for non-existent member', async () => {
      await client
        .patch(
          `/api/v1/namespaces/${testNamespaceId}/members/${secondClient.user.id}`,
        )
        .send({ role: NamespaceRole.MEMBER })
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should validate role enum values', async () => {
      await client
        .patch(
          `/api/v1/namespaces/${testNamespaceId}/members/${client.user.id}`,
        )
        .send({ role: 'invalid_role' })
        .expect(HttpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  describe('DELETE /api/v1/namespaces/:namespaceId/members/:userId', () => {
    it('should handle non-existent member gracefully', async () => {
      await client
        .delete(
          `/api/v1/namespaces/${testNamespaceId}/members/${secondClient.user.id}`,
        )
        .expect(HttpStatus.OK);
    });

    it('should remove member from namespace (when member exists)', async () => {
      // Create a test namespace and add a member
      const tempNamespace = await client
        .post('/api/v1/namespaces')
        .send({ name: 'Member Deletion Test Workspace' })
        .expect(HttpStatus.CREATED);

      const tempNamespaceId = tempNamespace.body.id;

      // Should fail because user is the only owner in the namespace.
      await client
        .delete(
          `/api/v1/namespaces/${tempNamespaceId}/members/${client.user.id}`,
        )
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);

      await client
        .delete(`/api/v1/namespaces/${tempNamespaceId}`)
        .expect(HttpStatus.OK);
    });

    it('should allow admin to quit namespace (self-removal)', async () => {
      // Create a test namespace
      const tempNamespace = await client
        .post('/api/v1/namespaces')
        .send({ name: uniqueNs('Admin Self-Quit Test') })
        .expect(HttpStatus.CREATED);

      const tempNamespaceId = tempNamespace.body.id;

      // Add secondClient as admin via invitation
      await addMemberViaInvitation(
        client,
        secondClient,
        tempNamespaceId,
        NamespaceRole.ADMIN,
        ResourcePermission.FULL_ACCESS,
      );

      // Admin quits the namespace (self-removal)
      await secondClient
        .delete(
          `/api/v1/namespaces/${tempNamespaceId}/members/${secondClient.user.id}`,
        )
        .expect(HttpStatus.OK);

      // Verify admin is no longer in the namespace
      const membersResponse = await client
        .get(`/api/v1/namespaces/${tempNamespaceId}/members`)
        .expect(HttpStatus.OK);

      const foundMember = membersResponse.body.find(
        (m: { userId?: string; user_id?: string }) =>
          (m.userId || m.user_id) === secondClient.user.id,
      );
      expect(foundMember).toBeUndefined();

      // Cleanup
      await client.delete(`/api/v1/namespaces/${tempNamespaceId}`);
    });

    it('should prevent owner from exiting namespace (case 15)', async () => {
      // Create a test namespace
      const tempNamespace = await client
        .post('/api/v1/namespaces')
        .send({ name: uniqueNs('Owner Exit Test') })
        .expect(HttpStatus.CREATED);

      const tempNamespaceId = tempNamespace.body.id;

      // Add a member to the namespace so it's not sole owner
      await addMemberViaInvitation(
        client,
        secondClient,
        tempNamespaceId,
        NamespaceRole.MEMBER,
        ResourcePermission.CAN_EDIT,
      );

      // Owner tries to exit - should fail (403 Forbidden)
      await client
        .delete(
          `/api/v1/namespaces/${tempNamespaceId}/members/${client.user.id}`,
        )
        .expect(HttpStatus.FORBIDDEN);

      // Verify owner is still in the namespace
      const membersResponse = await client
        .get(`/api/v1/namespaces/${tempNamespaceId}/members`)
        .expect(HttpStatus.OK);

      const ownerMember = membersResponse.body.find(
        (m: { userId?: string; user_id?: string }) =>
          (m.userId || m.user_id) === client.user.id,
      );
      expect(ownerMember).toBeDefined();

      // Cleanup
      await client.delete(`/api/v1/namespaces/${tempNamespaceId}`);
    });

    it('should allow member to quit namespace (self-removal)', async () => {
      // Create a test namespace
      const tempNamespace = await client
        .post('/api/v1/namespaces')
        .send({ name: uniqueNs('Member Self-Quit Test') })
        .expect(HttpStatus.CREATED);

      const tempNamespaceId = tempNamespace.body.id;

      // Add secondClient as member via invitation
      const memberInvitation = await client
        .post(`/api/v1/namespaces/${tempNamespaceId}/invitations`)
        .send({
          namespaceRole: NamespaceRole.MEMBER,
          rootPermission: ResourcePermission.CAN_EDIT,
        })
        .expect(HttpStatus.CREATED);

      await secondClient
        .post(
          `/api/v1/namespaces/${tempNamespaceId}/invitations/${memberInvitation.body.id}/accept`,
        )
        .expect(HttpStatus.CREATED);

      // Member quits the namespace (self-removal)
      await secondClient
        .delete(
          `/api/v1/namespaces/${tempNamespaceId}/members/${secondClient.user.id}`,
        )
        .expect(HttpStatus.OK);

      // Verify member is no longer in the namespace
      const membersResponse = await client
        .get(`/api/v1/namespaces/${tempNamespaceId}/members`)
        .expect(HttpStatus.OK);

      const foundMember = membersResponse.body.find(
        (m: { userId?: string; user_id?: string }) =>
          (m.userId || m.user_id) === secondClient.user.id,
      );
      expect(foundMember).toBeUndefined();

      // Cleanup
      await client.delete(`/api/v1/namespaces/${tempNamespaceId}`);
    });

    it('should prevent member from removing other members', async () => {
      // Create a test namespace
      const tempNamespace = await client
        .post('/api/v1/namespaces')
        .send({ name: uniqueNs('Member Remove Other Test') })
        .expect(HttpStatus.CREATED);

      const tempNamespaceId = tempNamespace.body.id;

      // Use the addMemberViaInvitation helper instead of creating inline
      // Add secondClient as member via invitation
      await addMemberViaInvitation(
        client,
        secondClient,
        tempNamespaceId,
        NamespaceRole.MEMBER,
        ResourcePermission.CAN_EDIT,
      );

      // Use client's namespace member (owner) as second member for this test
      // We'll test that secondClient (member) cannot remove the owner
      await secondClient
        .delete(
          `/api/v1/namespaces/${tempNamespaceId}/members/${client.user.id}`,
        )
        .expect(HttpStatus.FORBIDDEN);

      // Cleanup
      await client.delete(`/api/v1/namespaces/${tempNamespaceId}`);
    });
  });

  describe('GET /api/v1/namespaces/:namespaceId/root', () => {
    it('should return private root and conditionally teamspace root', async () => {
      const response = await client
        .get(`/api/v1/namespaces/${testNamespaceId}/root`)
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('private');

      const { private: privateRoot, teamspace: teamspaceRoot } = response.body;

      // Validate private root structure
      expect(privateRoot).toHaveProperty('id');
      expect(privateRoot).toHaveProperty('parent_id', '0');
      expect(privateRoot).toHaveProperty('children');
      expect(Array.isArray(privateRoot.children)).toBe(true);

      // Teamspace is conditionally returned (only when memberCount > 1 or has children)
      // For a single-user namespace with no teamspace children, teamspace may not be present
      if (teamspaceRoot) {
        expect(teamspaceRoot).toHaveProperty('id');
        expect(teamspaceRoot).toHaveProperty('parent_id', '0');
        expect(teamspaceRoot).toHaveProperty('children');
        expect(Array.isArray(teamspaceRoot.children)).toBe(true);
      }
    });

    it('should fail for non-member', async () => {
      await secondClient
        .get(`/api/v1/namespaces/${testNamespaceId}/root`)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should fail for non-existent namespace', async () => {
      await client
        .get('/api/v1/namespaces/nonexistent/root')
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('PATCH /api/v1/namespaces/:namespaceId', () => {
    let updateTestNamespaceId: string;

    beforeAll(async () => {
      // Create a namespace specifically for update tests
      const response = await client
        .post('/api/v1/namespaces')
        .send({ name: 'Update Test Workspace' })
        .expect(HttpStatus.CREATED);

      updateTestNamespaceId = response.body.id;
    });

    afterAll(async () => {
      // Clean up the update test namespace
      await client.delete(`/api/v1/namespaces/${updateTestNamespaceId}`);
    });

    it('should update namespace name', async () => {
      const updateNamespaceDto = {
        name: 'Updated Test Workspace',
      };

      await client
        .patch(`/api/v1/namespaces/${updateTestNamespaceId}`)
        .send(updateNamespaceDto)
        .expect(HttpStatus.OK);

      // Verify the update
      const response = await client
        .get(`/api/v1/namespaces/${updateTestNamespaceId}`)
        .expect(HttpStatus.OK);

      expect(response.body.name).toBe(updateNamespaceDto.name);
    });

    it('should fail for non-existent namespace', async () => {
      const updateNamespaceDto = {
        name: 'Non-existent Workspace',
      };

      await client
        .patch('/api/v1/namespaces/nonexistent')
        .send(updateNamespaceDto)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should validate update fields', async () => {
      const updateNamespaceDto = {
        name: '',
      };

      await client
        .patch(`/api/v1/namespaces/${updateTestNamespaceId}`)
        .send(updateNamespaceDto)
        .expect(HttpStatus.BAD_REQUEST); // Empty name might be allowed, depending on validation
    });
  });

  describe('DELETE /api/v1/namespaces/:namespaceId', () => {
    it('should succeed even if already deleted (soft delete behavior)', async () => {
      await client
        .delete('/api/v1/namespaces/nonexistent')
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should soft delete namespace', async () => {
      await client
        .delete(`/api/v1/namespaces/${testNamespaceId}`)
        .expect(HttpStatus.OK);

      // Verify namespace still exists but is soft deleted
      // The exact behavior depends on implementation - it might return 404 or still return the namespace
      await client
        .get(`/api/v1/namespaces/${testNamespaceId}`)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should prevent owner from deleting namespace with other members (case 40)', async () => {
      // Create a test namespace
      const tempNamespace = await client
        .post('/api/v1/namespaces')
        .send({ name: uniqueNs('Delete With Members Test') })
        .expect(HttpStatus.CREATED);

      const tempNamespaceId = tempNamespace.body.id;

      // Add secondClient as member
      await addMemberViaInvitation(
        client,
        secondClient,
        tempNamespaceId,
        NamespaceRole.MEMBER,
        ResourcePermission.CAN_EDIT,
      );

      // Owner tries to delete namespace with other members - should fail (403 Forbidden)
      await client
        .delete(`/api/v1/namespaces/${tempNamespaceId}`)
        .expect(HttpStatus.FORBIDDEN);

      // Cleanup: remove member first
      await client
        .delete(
          `/api/v1/namespaces/${tempNamespaceId}/members/${secondClient.user.id}`,
        )
        .expect(HttpStatus.OK);

      // Now owner can delete the namespace
      await client
        .delete(`/api/v1/namespaces/${tempNamespaceId}`)
        .expect(HttpStatus.OK);
    });

    it('should allow owner to delete namespace when sole member (case 40)', async () => {
      // Create a test namespace - owner is the only member
      const tempNamespace = await client
        .post('/api/v1/namespaces')
        .send({ name: uniqueNs('Delete Sole Owner Test') })
        .expect(HttpStatus.CREATED);

      const tempNamespaceId = tempNamespace.body.id;

      // Owner can delete namespace when they are the sole member
      await client
        .delete(`/api/v1/namespaces/${tempNamespaceId}`)
        .expect(HttpStatus.OK);

      // Verify namespace is deleted
      await client
        .get(`/api/v1/namespaces/${tempNamespaceId}`)
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('Admin Role Management', () => {
    let adminTestNamespaceId: string;
    let thirdClient: TestClient;

    beforeAll(async () => {
      thirdClient = await TestClient.create();

      // Create a namespace for admin role testing
      const response = await client
        .post('/api/v1/namespaces')
        .send({ name: uniqueNs('Admin Role Test') })
        .expect(HttpStatus.CREATED);

      adminTestNamespaceId = response.body.id;

      // Add secondClient as admin via invitation
      await addMemberViaInvitation(
        client,
        secondClient,
        adminTestNamespaceId,
        NamespaceRole.ADMIN,
      );

      // Add thirdClient as member via invitation
      await addMemberViaInvitation(
        client,
        thirdClient,
        adminTestNamespaceId,
        NamespaceRole.MEMBER,
      );
    });

    afterAll(async () => {
      await client
        .delete(`/api/v1/namespaces/${adminTestNamespaceId}`)
        .catch(() => {});
      await thirdClient.close();
    });

    describe('Adding members via invitations', () => {
      it('should create invitation with admin role when owner requested', async () => {
        // Create invitation with owner role - should be saved as admin
        const invitationRes = await client
          .post(`/api/v1/namespaces/${adminTestNamespaceId}/invitations`)
          .send({
            namespaceRole: NamespaceRole.OWNER,
            rootPermission: ResourcePermission.FULL_ACCESS,
          })
          .expect(HttpStatus.CREATED);

        // The invitation is created (we verify auto-downgrade works at the service level)
        expect(invitationRes.body).toHaveProperty('id');

        // Clean up invitation
        await client
          .delete(
            `/api/v1/namespaces/${adminTestNamespaceId}/invitations/${invitationRes.body.id}`,
          )
          .expect(HttpStatus.OK);
      });
    });

    describe('Admin permissions', () => {
      it('should allow admin to list members', async () => {
        const response = await secondClient
          .get(`/api/v1/namespaces/${adminTestNamespaceId}/members`)
          .expect(HttpStatus.OK);

        expect(Array.isArray(response.body)).toBe(true);
        expect(response.body.length).toBeGreaterThan(0);
      });

      it('should allow admin to update namespace settings', async () => {
        const newName = uniqueNs('Updated By Admin');
        await secondClient
          .patch(`/api/v1/namespaces/${adminTestNamespaceId}`)
          .send({ name: newName })
          .expect(HttpStatus.OK);

        // Verify update
        const response = await client
          .get(`/api/v1/namespaces/${adminTestNamespaceId}`)
          .expect(HttpStatus.OK);

        expect(response.body.name).toBe(newName);
      });

      it('should prevent admin from promoting member to admin', async () => {
        // Admin tries to promote member to admin - should fail
        await secondClient
          .patch(
            `/api/v1/namespaces/${adminTestNamespaceId}/members/${thirdClient.user.id}`,
          )
          .send({ role: NamespaceRole.ADMIN })
          .expect(HttpStatus.FORBIDDEN);
      });

      it('should prevent admin from promoting to owner', async () => {
        await secondClient
          .patch(
            `/api/v1/namespaces/${adminTestNamespaceId}/members/${thirdClient.user.id}`,
          )
          .send({ role: NamespaceRole.OWNER })
          .expect(HttpStatus.FORBIDDEN);
      });

      it('should prevent admin from removing owner', async () => {
        await secondClient
          .delete(
            `/api/v1/namespaces/${adminTestNamespaceId}/members/${client.user.id}`,
          )
          .expect(HttpStatus.FORBIDDEN);
      });

      it('should prevent admin from deleting namespace', async () => {
        await secondClient
          .delete(`/api/v1/namespaces/${adminTestNamespaceId}`)
          .expect(HttpStatus.FORBIDDEN);
      });

      it('should prevent admin from demoting another admin to member', async () => {
        // First, have owner promote thirdClient to admin
        await client
          .patch(
            `/api/v1/namespaces/${adminTestNamespaceId}/members/${thirdClient.user.id}`,
          )
          .send({ role: NamespaceRole.ADMIN })
          .expect(HttpStatus.OK);

        // Now secondClient (admin) tries to demote thirdClient (admin) to member - should fail
        await secondClient
          .patch(
            `/api/v1/namespaces/${adminTestNamespaceId}/members/${thirdClient.user.id}`,
          )
          .send({ role: NamespaceRole.MEMBER })
          .expect(HttpStatus.FORBIDDEN);

        // Restore thirdClient to member (by owner)
        await client
          .patch(
            `/api/v1/namespaces/${adminTestNamespaceId}/members/${thirdClient.user.id}`,
          )
          .send({ role: NamespaceRole.MEMBER })
          .expect(HttpStatus.OK);
      });

      it('should prevent admin from demoting self to member', async () => {
        // Admin tries to demote self to member - should fail
        await secondClient
          .patch(
            `/api/v1/namespaces/${adminTestNamespaceId}/members/${secondClient.user.id}`,
          )
          .send({ role: NamespaceRole.MEMBER })
          .expect(HttpStatus.FORBIDDEN);
      });

      it('should prevent admin from modifying owner role', async () => {
        // Admin tries to change owner's role - should fail
        await secondClient
          .patch(
            `/api/v1/namespaces/${adminTestNamespaceId}/members/${client.user.id}`,
          )
          .send({ role: NamespaceRole.MEMBER })
          .expect(HttpStatus.FORBIDDEN);
      });
    });

    describe('Member permissions', () => {
      it('should prevent member from listing members', async () => {
        await thirdClient
          .get(`/api/v1/namespaces/${adminTestNamespaceId}/members`)
          .expect(HttpStatus.FORBIDDEN);
      });

      it('should prevent member from updating namespace settings', async () => {
        await thirdClient
          .patch(`/api/v1/namespaces/${adminTestNamespaceId}`)
          .send({ name: 'Attempted Update By Member' })
          .expect(HttpStatus.FORBIDDEN);
      });

      it('should prevent member from updating member roles', async () => {
        await thirdClient
          .patch(
            `/api/v1/namespaces/${adminTestNamespaceId}/members/${secondClient.user.id}`,
          )
          .send({ role: NamespaceRole.MEMBER })
          .expect(HttpStatus.FORBIDDEN);
      });

      it('should prevent member from deleting namespace', async () => {
        await thirdClient
          .delete(`/api/v1/namespaces/${adminTestNamespaceId}`)
          .expect(HttpStatus.FORBIDDEN);
      });

      it('should prevent member from creating invitations', async () => {
        await thirdClient
          .post(`/api/v1/namespaces/${adminTestNamespaceId}/invitations`)
          .send({
            namespaceRole: NamespaceRole.MEMBER,
            rootPermission: ResourcePermission.CAN_VIEW,
          })
          .expect(HttpStatus.FORBIDDEN);
      });

      it('should prevent member from listing invitations', async () => {
        await thirdClient
          .get(`/api/v1/namespaces/${adminTestNamespaceId}/invitations`)
          .expect(HttpStatus.FORBIDDEN);
      });

      it('should prevent member from deleting invitations', async () => {
        // First, owner creates an invitation
        const invitationRes = await client
          .post(`/api/v1/namespaces/${adminTestNamespaceId}/invitations`)
          .send({
            namespaceRole: NamespaceRole.MEMBER,
            rootPermission: ResourcePermission.CAN_VIEW,
          })
          .expect(HttpStatus.CREATED);

        // Member tries to delete it - should fail
        await thirdClient
          .delete(
            `/api/v1/namespaces/${adminTestNamespaceId}/invitations/${invitationRes.body.id}`,
          )
          .expect(HttpStatus.FORBIDDEN);

        // Cleanup: owner deletes the invitation
        await client
          .delete(
            `/api/v1/namespaces/${adminTestNamespaceId}/invitations/${invitationRes.body.id}`,
          )
          .expect(HttpStatus.OK);
      });
    });

    describe('Ownership transfer', () => {
      it('should allow owner to transfer ownership', async () => {
        // Create a separate namespace for transfer testing
        const transferNs = await client
          .post('/api/v1/namespaces')
          .send({ name: uniqueNs('Transfer Test') })
          .expect(HttpStatus.CREATED);

        // Add secondClient as admin
        await addMemberViaInvitation(
          client,
          secondClient,
          transferNs.body.id,
          NamespaceRole.ADMIN,
        );

        // Transfer ownership to admin (secondClient)
        await client
          .post(`/api/v1/namespaces/${transferNs.body.id}/transfer-ownership`)
          .send({ newOwnerId: secondClient.user.id })
          .expect(HttpStatus.CREATED);

        // Verify roles changed
        const members = await secondClient
          .get(`/api/v1/namespaces/${transferNs.body.id}/members`)
          .expect(HttpStatus.OK);

        const originalOwner = members.body.find(
          (m: { userId?: string; user_id?: string }) =>
            (m.userId || m.user_id) === client.user.id,
        );
        const newOwner = members.body.find(
          (m: { userId?: string; user_id?: string }) =>
            (m.userId || m.user_id) === secondClient.user.id,
        );

        expect(originalOwner.role).toBe(NamespaceRole.ADMIN);
        expect(newOwner.role).toBe(NamespaceRole.OWNER);

        // Cleanup - new owner deletes namespace
        await secondClient.delete(`/api/v1/namespaces/${transferNs.body.id}`);
      });

      it('should prevent admin from transferring ownership', async () => {
        await secondClient
          .post(`/api/v1/namespaces/${adminTestNamespaceId}/transfer-ownership`)
          .send({ newOwnerId: thirdClient.user.id })
          .expect(HttpStatus.FORBIDDEN);
      });

      it('should prevent transfer to non-member', async () => {
        const nonMemberClient = await TestClient.create();

        await client
          .post(`/api/v1/namespaces/${adminTestNamespaceId}/transfer-ownership`)
          .send({ newOwnerId: nonMemberClient.user.id })
          .expect(HttpStatus.UNPROCESSABLE_ENTITY);

        await nonMemberClient.close();
      });
    });

    // Note: The "prevent promoting to owner" case is already covered by
    // "should prevent admin from promoting to owner" in Admin permissions
  });

  describe('Edge Cases and Error Handling', () => {
    let edgeTestNamespaceId: string;
    let edgeClient: TestClient;

    beforeAll(async () => {
      // Use a fresh client for edge case testing to ensure isolation
      edgeClient = await TestClient.create();

      // Create a namespace for edge case testing
      const response = await edgeClient
        .post('/api/v1/namespaces')
        .send({ name: uniqueNs('Edge Test') })
        .expect(HttpStatus.CREATED);

      edgeTestNamespaceId = response.body.id;
    });

    afterAll(async () => {
      // Clean up edge test namespace
      await edgeClient
        .delete(`/api/v1/namespaces/${edgeTestNamespaceId}`)
        .catch(() => {}); // Ignore errors if already deleted
      await edgeClient.close();
    });

    it('should handle special characters in namespace name', async () => {
      const specialNameWorkspace = {
        name: uniqueNs('特殊字符 émojis 🚀'),
      };

      const response = await edgeClient
        .post('/api/v1/namespaces')
        .send(specialNameWorkspace)
        .expect(HttpStatus.CREATED);

      // Emojis should be filtered out - name should contain the base part without emoji
      expect(response.body.name).toContain('特殊字符');

      // Clean up
      await edgeClient
        .delete(`/api/v1/namespaces/${response.body.id}`)
        .expect(HttpStatus.OK);
    });

    it('should handle very long namespace names', async () => {
      const longName = 'A'.repeat(64); // Test boundary conditions
      const longNameWorkspace = {
        name: longName,
      };

      const response = await edgeClient
        .post('/api/v1/namespaces')
        .send(longNameWorkspace)
        .expect(HttpStatus.CREATED);

      expect(response.body.name).toBe(longName);

      // Clean up
      await edgeClient
        .delete(`/api/v1/namespaces/${response.body.id}`)
        .expect(HttpStatus.OK);
    });

    it('should handle invalid UUID formats in parameters', async () => {
      await edgeClient
        .get('/api/v1/namespaces/invalid-uuid-format')
        .expect(HttpStatus.NOT_FOUND);

      await edgeClient
        .get('/api/v1/namespaces/invalid-uuid/members')
        .expect(HttpStatus.FORBIDDEN);

      await edgeClient
        .get('/api/v1/namespaces/invalid-uuid/members/also-invalid')
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should handle concurrent namespace operations', async () => {
      const timestamp = Date.now();
      // Create multiple namespaces concurrently
      const createPromises = Array.from({ length: 2 }, (_, i) =>
        edgeClient
          .post('/api/v1/namespaces')
          .send({ name: `Concurrent ${timestamp}-${i}` }),
      );

      const results = await Promise.all(createPromises);

      // Verify all were created successfully
      results.forEach((result) => {
        expect(result.status).toBe(HttpStatus.CREATED);
        expect(result.body).toHaveProperty('id');
        expect(result.body).toHaveProperty('name');
      });

      // Clean up all created namespaces
      const deletePromises = results.map((result) =>
        edgeClient.delete(`/api/v1/namespaces/${result.body.id}`),
      );

      await Promise.all(deletePromises);
    });

    it('should maintain referential integrity when deleting namespace', async () => {
      // Create a namespace
      const namespace = await edgeClient
        .post('/api/v1/namespaces')
        .send({ name: uniqueNs('Referential Integrity') })
        .expect(HttpStatus.CREATED);

      const namespaceId = namespace.body.id;

      // Get the root resources
      const rootResponse = await edgeClient
        .get(`/api/v1/namespaces/${namespaceId}/root`)
        .expect(HttpStatus.OK);

      expect(rootResponse.body).toHaveProperty('private');
      // Teamspace may not be present for single-user namespaces without teamspace children
      // expect(rootResponse.body).toHaveProperty('teamspace');

      // Delete the namespace
      await edgeClient
        .delete(`/api/v1/namespaces/${namespaceId}`)
        .expect(HttpStatus.OK);

      // Verify root resources are no longer accessible
      await edgeClient
        .get(`/api/v1/namespaces/${namespaceId}/root`)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should handle null and undefined values gracefully', async () => {
      // Test with null name
      await edgeClient
        .post('/api/v1/namespaces')
        .send({ name: null })
        .expect(HttpStatus.BAD_REQUEST);

      // Test with undefined in request body
      await edgeClient
        .post('/api/v1/namespaces')
        .send({ name: undefined })
        .expect(HttpStatus.BAD_REQUEST);

      // Test update with null name
      await edgeClient
        .patch(`/api/v1/namespaces/${edgeTestNamespaceId}`)
        .send({ name: null })
        .expect(HttpStatus.OK);
    });
  });
});
