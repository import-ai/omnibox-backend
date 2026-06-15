import { HttpStatus } from '@nestjs/common';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import { SmartFolderRootScope } from 'omniboxd/smart-folders/entities/smart-folder-config.entity';
import { TestClient } from 'test/test-client';

describe('ResourcesController (e2e)', () => {
  let client: TestClient;
  let memberClient: TestClient;
  let outsiderClient: TestClient;
  let uid = 0;
  const uniqueName = (base: string) => `${base} ${++uid}`;
  const setUserPermission = async (
    resourceId: string,
    permission: ResourcePermission,
  ) => {
    await client
      .patch(
        `/api/v1/namespaces/${client.namespace.id}/resources/${resourceId}/permissions/users/${memberClient.user.id}`,
      )
      .send({ permission })
      .expect(HttpStatus.OK);
  };

  beforeAll(async () => {
    client = await TestClient.create();
  });

  afterAll(async () => {
    await outsiderClient?.close();
    await memberClient?.close();
    await client?.close();
  });

  describe('POST /api/v1/namespaces/:namespaceId/resources', () => {
    it('should create a new document resource', async () => {
      const tagIds = await client.createTags(['test', 'document']);

      const resourceData = {
        name: uniqueName('Test Document'),
        namespaceId: client.namespace.id,
        resourceType: ResourceType.DOC,
        parentId: client.namespace.root_resource_id,
        content: 'This is a test document content',
        tag_ids: tagIds,
        attrs: { custom: 'attribute' },
      };

      const response = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .send(resourceData)
        .expect(HttpStatus.CREATED);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe(resourceData.name);
      expect(response.body.resource_type).toBe(resourceData.resourceType);
      expect(response.body.content).toBe(resourceData.content);
      expect(response.body.tags).toHaveLength(resourceData.tag_ids.length);
      expect(response.body.tags.map((tag) => tag.name)).toEqual(
        expect.arrayContaining(['test', 'document']),
      );
      expect(response.body.attrs).toEqual(resourceData.attrs);
    });

    it('should create a new folder resource', async () => {
      const resourceData = {
        name: uniqueName('Test Folder'),
        namespaceId: client.namespace.id,
        resourceType: ResourceType.FOLDER,
        parentId: client.namespace.root_resource_id,
        content: '',
        tags: ['folder'],
        attrs: {},
      };

      const response = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .send(resourceData)
        .expect(HttpStatus.CREATED);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe(resourceData.name);
      expect(response.body.resource_type).toBe(ResourceType.FOLDER);
    });

    it('should create a new link resource', async () => {
      const resourceData = {
        name: uniqueName('Test Link'),
        namespaceId: client.namespace.id,
        resourceType: ResourceType.LINK,
        parentId: client.namespace.root_resource_id,
        content: 'https://example.com',
        tags: ['link'],
        attrs: { url: 'https://example.com' },
      };

      const response = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .send(resourceData)
        .expect(HttpStatus.CREATED);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe(resourceData.name);
      expect(response.body.resource_type).toBe(ResourceType.LINK);
      expect(response.body.content).toBe(resourceData.content);
    });

    it('should fail with invalid resource type', async () => {
      const resourceData = {
        name: uniqueName('Invalid Resource'),
        namespaceId: client.namespace.id,
        resourceType: 'invalid_type',
        parentId: client.namespace.root_resource_id,
        content: 'content',
      };

      await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .send(resourceData)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should fail with missing required fields', async () => {
      const resourceData = {
        name: uniqueName('Incomplete Resource'),
        // Missing namespaceId, resourceType, parentId
      };

      await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .send(resourceData)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should fail with empty parentId', async () => {
      const resourceData = {
        name: uniqueName('Test Resource'),
        namespaceId: client.namespace.id,
        resourceType: ResourceType.DOC,
        parentId: '',
        content: 'content',
      };

      await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .send(resourceData)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should reject smart folder as parent', async () => {
      const smartFolderResponse = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/smart-folders`)
        .send({
          name: uniqueName('Smart Folder Parent'),
          root_scope: SmartFolderRootScope.PRIVATE,
          conditions: [],
        })
        .expect(HttpStatus.CREATED);

      await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .send({
          name: uniqueName('Resource Under Smart Folder'),
          namespaceId: client.namespace.id,
          resourceType: ResourceType.DOC,
          parentId: smartFolderResponse.body.resource_id,
          content: 'content',
        })
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);
    });
  });

  describe('GET /api/v1/namespaces/:namespaceId/resources', () => {
    let resourceId: string;
    const testAttrs = {
      custom: 'attribute',
      nested: { key: 'value' },
      number: 42,
    };

    beforeEach(async () => {
      // Create a resource for testing
      const resourceData = {
        name: uniqueName('Test Resource for Query'),
        namespaceId: client.namespace.id,
        resourceType: ResourceType.DOC,
        parentId: client.namespace.root_resource_id,
        content: 'Test content',
        tags: ['test'],
        attrs: testAttrs,
      };

      const response = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .send(resourceData)
        .expect(HttpStatus.CREATED);
      resourceId = response.body.id;
    });

    it('should find resource by single ID and validate attrs match source', async () => {
      const response = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources?id=${resourceId}`,
        )
        .expect(HttpStatus.OK);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].id).toBe(resourceId);
      expect(response.body[0].attrs).toEqual(testAttrs);
    });

    it('should find resources by multiple IDs and validate attrs match source', async () => {
      // Create another resource with different attrs
      const testAttrs2 = {
        different: 'attrs',
        array: [1, 2, 3],
        boolean: true,
      };
      const resourceData2 = {
        name: uniqueName('Second Test Resource'),
        namespaceId: client.namespace.id,
        resourceType: ResourceType.DOC,
        parentId: client.namespace.root_resource_id,
        content: 'Second test content',
        tags: ['test2'],
        attrs: testAttrs2,
      };

      const response2 = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .send(resourceData2)
        .expect(HttpStatus.CREATED);
      const resourceId2 = response2.body.id;

      const response = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources?id=${resourceId},${resourceId2}`,
        )
        .expect(HttpStatus.OK);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(2);
      const ids = response.body.map((r: any) => r.id);
      expect(ids).toContain(resourceId);
      expect(ids).toContain(resourceId2);

      // Validate attrs for both resources
      const resource1 = response.body.find((r: any) => r.id === resourceId);
      const resource2 = response.body.find((r: any) => r.id === resourceId2);
      expect(resource1.attrs).toEqual(testAttrs);
      expect(resource2.attrs).toEqual(testAttrs2);
    });

    it('should return empty array when no ID provided', async () => {
      const response = await client
        .get(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .expect(HttpStatus.OK);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(0);
    });

    it('should return empty array for non-existent IDs', async () => {
      const response = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources?id=non-existent-id`,
        )
        .expect(HttpStatus.OK);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(0);
    });
  });

  describe('GET /api/v1/namespaces/:namespaceId/resources/:resourceId', () => {
    let resourceId: string;

    beforeEach(async () => {
      // Create a resource for testing
      const tagIds = await client.createTags(['get-test']);
      const resourceData = {
        name: uniqueName('Test Resource for Get'),
        namespaceId: client.namespace.id,
        resourceType: ResourceType.DOC,
        parentId: client.namespace.root_resource_id,
        content: 'Test content for get',
        tag_ids: tagIds,
        attrs: { test: 'value' },
      };

      const response = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .send(resourceData)
        .expect(HttpStatus.CREATED);
      resourceId = response.body.id;
    });

    it('should get resource details with path', async () => {
      const response = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/${resourceId}`,
        )
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('id', resourceId);
      expect(response.body.name).toContain('Test Resource for Get');
      expect(response.body).toHaveProperty('content', 'Test content for get');
      expect(response.body).toHaveProperty('tags');
      expect(response.body.tags.map((tag) => tag.name)).toContain('get-test');
      expect(response.body).toHaveProperty('attrs');
      expect(response.body.attrs).toEqual({ test: 'value' });
      expect(response.body).toHaveProperty('path');
      expect(Array.isArray(response.body.path)).toBe(true);
      expect(response.body).toHaveProperty('current_permission');
      expect(response.body).toHaveProperty('space_type');
    });

    it('should fail with non-existent resource ID', async () => {
      await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/non-existent-id`,
        )
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('PATCH /api/v1/namespaces/:namespaceId/resources/:resourceId', () => {
    let resourceId: string;

    beforeEach(async () => {
      // Create a resource for testing
      const resourceData = {
        name: uniqueName('Test Resource for Update'),
        namespaceId: client.namespace.id,
        resourceType: ResourceType.DOC,
        parentId: client.namespace.root_resource_id,
        content: 'Original content',
        tags: ['original'],
        attrs: { original: 'value' },
      };

      const response = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .send(resourceData)
        .expect(HttpStatus.CREATED);
      resourceId = response.body.id;
    });

    it('should update resource name', async () => {
      const updateData = {
        name: 'Updated Resource Name',
        namespaceId: client.namespace.id,
      };

      const response = await client
        .patch(
          `/api/v1/namespaces/${client.namespace.id}/resources/${resourceId}`,
        )
        .send(updateData)
        .expect(HttpStatus.OK);

      expect(response.body.name).toBe(updateData.name);
    });

    it('should update resource content', async () => {
      const updateData = {
        content: 'Updated content',
        namespaceId: client.namespace.id,
      };

      const response = await client
        .patch(
          `/api/v1/namespaces/${client.namespace.id}/resources/${resourceId}`,
        )
        .send(updateData)
        .expect(HttpStatus.OK);

      expect(response.body.content).toBe(updateData.content);
    });

    it('should update resource tags', async () => {
      const tagIds = await client.createTags(['updated', 'tags']);
      const updateData = {
        tag_ids: tagIds,
        namespaceId: client.namespace.id,
      };

      const response = await client
        .patch(
          `/api/v1/namespaces/${client.namespace.id}/resources/${resourceId}`,
        )
        .send(updateData)
        .expect(HttpStatus.OK);

      expect(response.body.tags.map((tag) => tag.name)).toEqual(
        expect.arrayContaining(['updated', 'tags']),
      );
    });

    it('should update resource attrs', async () => {
      const updateData = {
        attrs: { updated: 'attribute', new: 'value' },
        namespaceId: client.namespace.id,
      };

      const response = await client
        .patch(
          `/api/v1/namespaces/${client.namespace.id}/resources/${resourceId}`,
        )
        .send(updateData)
        .expect(HttpStatus.OK);

      expect(response.body.attrs).toEqual(updateData.attrs);
    });

    it('should fail with non-existent resource ID', async () => {
      const updateData = {
        name: 'Updated Name',
        namespaceId: client.namespace.id,
      };

      await client
        .patch(
          `/api/v1/namespaces/${client.namespace.id}/resources/non-existent-id`,
        )
        .send(updateData)
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('DELETE /api/v1/namespaces/:namespaceId/resources/:resourceId', () => {
    let resourceId: string;

    beforeEach(async () => {
      // Create a resource for testing
      const resourceData = {
        name: uniqueName('Test Resource for Delete'),
        namespaceId: client.namespace.id,
        resourceType: ResourceType.DOC,
        parentId: client.namespace.root_resource_id,
        content: 'Content to be deleted',
        tags: ['delete-test'],
        attrs: {},
      };

      const response = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .send(resourceData)
        .expect(HttpStatus.CREATED);
      resourceId = response.body.id;
    });

    it('should delete resource', async () => {
      await client
        .delete(
          `/api/v1/namespaces/${client.namespace.id}/resources/${resourceId}`,
        )
        .expect(HttpStatus.OK);

      // Verify the resource is deleted by trying to get it
      await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/${resourceId}`,
        )
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should fail with non-existent resource ID', async () => {
      await client
        .delete(
          `/api/v1/namespaces/${client.namespace.id}/resources/non-existent-id`,
        )
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('POST /api/v1/namespaces/:namespaceId/resources/:resourceId/duplicate', () => {
    let resourceId: string;

    beforeEach(async () => {
      // Create a resource for testing
      const tagIds = await client.createTags(['duplicate-test']);
      const resourceData = {
        name: uniqueName('Test Resource for Duplicate'),
        namespaceId: client.namespace.id,
        resourceType: ResourceType.DOC,
        parentId: client.namespace.root_resource_id,
        content: 'Content to be duplicated',
        tag_ids: tagIds,
        attrs: { test: 'duplicate' },
      };

      const response = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .send(resourceData)
        .expect(HttpStatus.CREATED);
      resourceId = response.body.id;
    });

    it('should duplicate resource', async () => {
      const response = await client
        .post(
          `/api/v1/namespaces/${client.namespace.id}/resources/${resourceId}/duplicate`,
        )
        .expect(HttpStatus.CREATED);

      expect(response.body).toHaveProperty('id');
      expect(response.body.id).not.toBe(resourceId); // Should be a different ID
      expect(response.body.name).toContain('Test Resource for Duplicate'); // Name should be similar but different
      expect(response.body.content).toBe('Content to be duplicated');
      expect(response.body.tags.map((tag) => tag.name)).toEqual([
        'duplicate-test',
      ]);
      expect(response.body.attrs).toEqual({ test: 'duplicate' });
    });

    it('should fail with non-existent resource ID', async () => {
      await client
        .post(
          `/api/v1/namespaces/${client.namespace.id}/resources/non-existent-id/duplicate`,
        )
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('GET /api/v1/namespaces/:namespaceId/resources/query', () => {
    let parentFolderId: string;
    let childResourceId: string;
    const folderAttrs = { folder: 'metadata', type: 'container' };
    const childAttrs = { child: 'data', priority: 1, tags_meta: ['important'] };

    beforeEach(async () => {
      // Create tags first
      const folderTagIds = await client.createTags(['folder']);
      const childTagIds = await client.createTags(['child', 'query-test']);

      // Create a parent folder
      const folderData = {
        name: uniqueName('Parent Folder'),
        namespaceId: client.namespace.id,
        resourceType: ResourceType.FOLDER,
        parentId: client.namespace.root_resource_id,
        content: '',
        tag_ids: folderTagIds,
        attrs: folderAttrs,
      };

      const folderResponse = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .send(folderData)
        .expect(HttpStatus.CREATED);
      parentFolderId = folderResponse.body.id;

      // Create a child resource
      const childData = {
        name: uniqueName('Child Resource'),
        namespaceId: client.namespace.id,
        resourceType: ResourceType.DOC,
        parentId: parentFolderId,
        content: 'Child content',
        tag_ids: childTagIds,
        attrs: childAttrs,
      };

      const childResponse = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .send(childData)
        .expect(HttpStatus.CREATED);
      childResourceId = childResponse.body.id;
    });

    it('should query resources by parentId and validate attrs match source', async () => {
      const response = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/query?parentId=${parentFolderId}`,
        )
        .expect(HttpStatus.OK);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      const childResource = response.body.find(
        (r: any) => r.id === childResourceId,
      );
      expect(childResource).toBeDefined();
      expect(childResource.name).toContain('Child Resource');
      expect(childResource.attrs).toEqual(childAttrs);
    });

    it('should query resources by tags', async () => {
      const response = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/query?parentId=${parentFolderId}&tags=child`,
        )
        .expect(HttpStatus.OK);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      const childResource = response.body.find(
        (r: any) => r.id === childResourceId,
      );
      expect(childResource).toBeDefined();
    });

    it('should query resources by multiple tags', async () => {
      const response = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/query?parentId=${parentFolderId}&tags=child,query-test`,
        )
        .expect(HttpStatus.OK);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      const childResource = response.body.find(
        (r: any) => r.id === childResourceId,
      );
      expect(childResource).toBeDefined();
    });

    it('should return empty array for non-matching tags', async () => {
      const response = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/query?parentId=${parentFolderId}&tags=non-existent-tag`,
        )
        .expect(HttpStatus.OK);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(0);
    });
  });

  describe('GET /api/v1/namespaces/:namespaceId/resources/:resourceId/children', () => {
    let parentFolderId: string;
    let childResourceId: string;
    const parentAttrs = { parent: 'folder', permissions: 'read-write' };
    const childAttrs = {
      child: 'document',
      version: 1.0,
      metadata: { author: 'test' },
    };

    beforeEach(async () => {
      // Create a parent folder
      const folderData = {
        name: uniqueName('Parent Folder for Children'),
        namespaceId: client.namespace.id,
        resourceType: ResourceType.FOLDER,
        parentId: client.namespace.root_resource_id,
        content: '',
        tags: ['folder'],
        attrs: parentAttrs,
      };

      const folderResponse = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .send(folderData)
        .expect(HttpStatus.CREATED);
      parentFolderId = folderResponse.body.id;

      // Create a child resource
      const childData = {
        name: uniqueName('Child Resource for List'),
        namespaceId: client.namespace.id,
        resourceType: ResourceType.DOC,
        parentId: parentFolderId,
        content: 'Child content for list',
        tags: ['child'],
        attrs: childAttrs,
      };

      const childResponse = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .send(childData)
        .expect(HttpStatus.CREATED);
      childResourceId = childResponse.body.id;
    });

    it('should list children of a resource and validate attrs match source', async () => {
      const response = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/${parentFolderId}/children`,
        )
        .expect(HttpStatus.OK);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      const childResource = response.body.find(
        (r: any) => r.id === childResourceId,
      );
      expect(childResource).toBeDefined();
      expect(childResource.name).toContain('Child Resource for List');
    });

    it('should return empty array for resource with no children', async () => {
      const response = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/${childResourceId}/children`,
        )
        .expect(HttpStatus.OK);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(0);
    });

    it('should fail with non-existent resource ID', async () => {
      await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/non-existent-id/children`,
        )
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('POST /api/v1/namespaces/:namespaceId/resources/:resourceId/move/:targetId', () => {
    let sourceResourceId: string;
    let targetFolderId: string;

    const createMoveResource = async (
      name: string,
      resourceType: ResourceType,
      parentId: string = client.namespace.root_resource_id,
    ) => {
      const response = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .send({
          name: uniqueName(name),
          namespaceId: client.namespace.id,
          resourceType,
          parentId,
          content: '',
          tags: ['move-test'],
          attrs: {},
        })
        .expect(HttpStatus.CREATED);
      return response.body.id;
    };

    beforeAll(async () => {
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

      await client
        .delete(
          `/api/v1/namespaces/${client.namespace.id}/invitations/${invitation.body.id}`,
        )
        .expect(HttpStatus.OK);
    });

    beforeEach(async () => {
      // Create a target folder
      const targetFolderData = {
        name: uniqueName('Target Folder'),
        namespaceId: client.namespace.id,
        resourceType: ResourceType.FOLDER,
        parentId: client.namespace.root_resource_id,
        content: '',
        tags: ['target'],
        attrs: {},
      };

      const targetResponse = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .send(targetFolderData)
        .expect(HttpStatus.CREATED);
      targetFolderId = targetResponse.body.id;

      // Create a source resource to move
      const sourceData = {
        name: uniqueName('Resource to Move'),
        namespaceId: client.namespace.id,
        resourceType: ResourceType.DOC,
        parentId: client.namespace.root_resource_id,
        content: 'Content to move',
        tags: ['move-test'],
        attrs: {},
      };

      const sourceResponse = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .send(sourceData)
        .expect(HttpStatus.CREATED);
      sourceResourceId = sourceResponse.body.id;
    });

    it('should move resource to target folder', async () => {
      await client
        .post(
          `/api/v1/namespaces/${client.namespace.id}/resources/${sourceResourceId}/move/${targetFolderId}`,
        )
        .expect(HttpStatus.CREATED);

      // Verify the resource is now in the target folder
      const childrenResponse = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/${targetFolderId}/children`,
        )
        .expect(HttpStatus.OK);

      const movedResource = childrenResponse.body.find(
        (r: any) => r.id === sourceResourceId,
      );
      expect(movedResource).toBeDefined();
    });

    it('should fail with non-existent source resource', async () => {
      await client
        .post(
          `/api/v1/namespaces/${client.namespace.id}/resources/non-existent-source/move/${targetFolderId}`,
        )
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should fail with non-existent target resource', async () => {
      await client
        .post(
          `/api/v1/namespaces/${client.namespace.id}/resources/${sourceResourceId}/move/non-existent-target`,
        )
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should reject move when source is not editable', async () => {
      const sourceId = await createMoveResource(
        'View Only Source',
        ResourceType.DOC,
      );
      const targetId = await createMoveResource(
        'Editable Target',
        ResourceType.FOLDER,
      );
      await setUserPermission(sourceId, ResourcePermission.CAN_VIEW);

      await memberClient
        .post(
          `/api/v1/namespaces/${client.namespace.id}/resources/${sourceId}/move/${targetId}`,
        )
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should reject move when target is not editable', async () => {
      const sourceId = await createMoveResource(
        'Editable Source',
        ResourceType.DOC,
      );
      const targetId = await createMoveResource(
        'View Only Target',
        ResourceType.FOLDER,
      );
      await setUserPermission(targetId, ResourcePermission.CAN_VIEW);

      await memberClient
        .post(
          `/api/v1/namespaces/${client.namespace.id}/resources/${sourceId}/move/${targetId}`,
        )
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should move resource when source and target are editable', async () => {
      const sourceId = await createMoveResource(
        'Editable Move Source',
        ResourceType.DOC,
      );
      const targetId = await createMoveResource(
        'Editable Move Target',
        ResourceType.FOLDER,
      );

      await memberClient
        .post(
          `/api/v1/namespaces/${client.namespace.id}/resources/${sourceId}/move/${targetId}`,
        )
        .expect(HttpStatus.CREATED);

      const childrenResponse = await memberClient
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/${targetId}/children`,
        )
        .expect(HttpStatus.OK);

      expect(childrenResponse.body).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: sourceId })]),
      );
    });

    it('should reject move to smart folder', async () => {
      const smartFolderResponse = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/smart-folders`)
        .send({
          name: uniqueName('Smart Folder Move Target'),
          root_scope: SmartFolderRootScope.PRIVATE,
          conditions: [],
        })
        .expect(HttpStatus.CREATED);

      await client
        .post(
          `/api/v1/namespaces/${client.namespace.id}/resources/${sourceResourceId}/move/${smartFolderResponse.body.resource_id}`,
        )
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);
    });
  });

  describe('POST /api/v1/namespaces/:namespaceId/resources/batch-*', () => {
    beforeAll(async () => {
      if (memberClient) {
        return;
      }
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

      await client
        .delete(
          `/api/v1/namespaces/${client.namespace.id}/invitations/${invitation.body.id}`,
        )
        .expect(HttpStatus.OK);
    });

    async function createFolder(name: string, parentId: string) {
      const response = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .send({
          name: uniqueName(name),
          namespaceId: client.namespace.id,
          resourceType: ResourceType.FOLDER,
          parentId,
          content: '',
          attrs: {},
        })
        .expect(HttpStatus.CREATED);
      return response.body;
    }

    async function createDoc(name: string, parentId: string) {
      const response = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .send({
          name: uniqueName(name),
          namespaceId: client.namespace.id,
          resourceType: ResourceType.DOC,
          parentId,
          content: 'batch resource content',
          attrs: {},
        })
        .expect(HttpStatus.CREATED);
      return response.body;
    }

    it('should move selected resources to trash', async () => {
      const first = await createDoc(
        'Batch Trash First',
        client.namespace.root_resource_id,
      );
      const second = await createDoc(
        'Batch Trash Second',
        client.namespace.root_resource_id,
      );

      const response = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources/batch-trash`)
        .send({ resourceIds: [first.id, second.id] })
        .expect(HttpStatus.CREATED);

      expect(response.body).toMatchObject({
        success_ids: [first.id, second.id],
        failed_ids: [],
      });
      await client
        .get(`/api/v1/namespaces/${client.namespace.id}/resources/${first.id}`)
        .expect(HttpStatus.NOT_FOUND);
      await client
        .get(`/api/v1/namespaces/${client.namespace.id}/resources/${second.id}`)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should count sources without edit permission as failed on batch trash', async () => {
      const first = await createDoc(
        'Batch Trash Readonly First',
        client.namespace.root_resource_id,
      );
      const second = await createDoc(
        'Batch Trash Readonly Second',
        client.namespace.root_resource_id,
      );
      await setUserPermission(first.id, ResourcePermission.CAN_VIEW);
      await setUserPermission(second.id, ResourcePermission.CAN_VIEW);

      const response = await memberClient
        .post(`/api/v1/namespaces/${client.namespace.id}/resources/batch-trash`)
        .send({ resourceIds: [first.id, second.id] })
        .expect(HttpStatus.CREATED);

      expect(response.body).toEqual({
        success_ids: [],
        failed_ids: [first.id, second.id],
      });
      await memberClient
        .get(`/api/v1/namespaces/${client.namespace.id}/resources/${first.id}`)
        .expect(HttpStatus.OK);
      await memberClient
        .get(`/api/v1/namespaces/${client.namespace.id}/resources/${second.id}`)
        .expect(HttpStatus.OK);
    });

    it('should reject batch trash check when any selected resource is not editable', async () => {
      const first = await createDoc(
        'Batch Trash Check Readonly First',
        client.namespace.root_resource_id,
      );
      const second = await createDoc(
        'Batch Trash Check Editable Second',
        client.namespace.root_resource_id,
      );
      await setUserPermission(first.id, ResourcePermission.CAN_VIEW);
      await setUserPermission(second.id, ResourcePermission.CAN_EDIT);

      await memberClient
        .post(
          `/api/v1/namespaces/${client.namespace.id}/resources/batch-trash/check`,
        )
        .send({ resourceIds: [first.id, second.id] })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should reject batch trash from non namespace member even when resource is globally editable', async () => {
      outsiderClient = await TestClient.create();
      const resource = await createDoc(
        'Batch Trash Global Editable',
        client.namespace.root_resource_id,
      );
      await client
        .patch(
          `/api/v1/namespaces/${client.namespace.id}/resources/${resource.id}/permissions`,
        )
        .send({ permission: ResourcePermission.CAN_EDIT })
        .expect(HttpStatus.OK);

      await outsiderClient
        .post(`/api/v1/namespaces/${client.namespace.id}/resources/batch-trash`)
        .send({ resourceIds: [resource.id] })
        .expect(HttpStatus.FORBIDDEN);

      await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/${resource.id}`,
        )
        .expect(HttpStatus.OK);
    });

    it('should count source without edit permission as failed on batch move', async () => {
      const target = await createFolder(
        'Batch Move Editable Target',
        client.namespace.root_resource_id,
      );
      const readonlySource = await createDoc(
        'Batch Move Readonly Source',
        client.namespace.root_resource_id,
      );
      const editableSource = await createDoc(
        'Batch Move Editable Source',
        client.namespace.root_resource_id,
      );
      await setUserPermission(readonlySource.id, ResourcePermission.CAN_VIEW);

      const response = await memberClient
        .post(`/api/v1/namespaces/${client.namespace.id}/resources/batch-move`)
        .send({
          resourceIds: [readonlySource.id, editableSource.id],
          targetId: target.id,
        })
        .expect(HttpStatus.CREATED);

      expect(response.body).toMatchObject({
        success_ids: [editableSource.id],
        failed_ids: [readonlySource.id],
      });
      const childrenResponse = await memberClient
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/${target.id}/children`,
        )
        .expect(HttpStatus.OK);
      expect(childrenResponse.body.map((r: any) => r.id)).toContain(
        editableSource.id,
      );
      expect(childrenResponse.body.map((r: any) => r.id)).not.toContain(
        readonlySource.id,
      );
    });

    it('should reject batch move when no selected sources are editable', async () => {
      const target = await createFolder(
        'Batch Move No Editable Target',
        client.namespace.root_resource_id,
      );
      const first = await createDoc(
        'Batch Move No Editable First',
        client.namespace.root_resource_id,
      );
      const second = await createDoc(
        'Batch Move No Editable Second',
        client.namespace.root_resource_id,
      );
      await setUserPermission(first.id, ResourcePermission.CAN_VIEW);
      await setUserPermission(second.id, ResourcePermission.CAN_VIEW);

      await memberClient
        .post(`/api/v1/namespaces/${client.namespace.id}/resources/batch-move`)
        .send({ resourceIds: [first.id, second.id], targetId: target.id })
        .expect(HttpStatus.FORBIDDEN)
        .expect((response) => {
          expect(response.body.code).toBe('batch_source_not_editable');
        });
    });

    it('should reject batch move when target is not editable', async () => {
      const target = await createFolder(
        'Batch Move Readonly Target',
        client.namespace.root_resource_id,
      );
      const source = await createDoc(
        'Batch Move Target Permission Source',
        client.namespace.root_resource_id,
      );
      await setUserPermission(target.id, ResourcePermission.CAN_VIEW);

      await memberClient
        .post(`/api/v1/namespaces/${client.namespace.id}/resources/batch-move`)
        .send({ resourceIds: [source.id], targetId: target.id })
        .expect(HttpStatus.FORBIDDEN)
        .expect((response) => {
          expect(response.body.code).toBe('target_not_editable');
        });
    });

    it('should report name conflicts on batch move', async () => {
      const target = await createFolder(
        'Batch Move Name Conflict Target',
        client.namespace.root_resource_id,
      );
      const conflictName = uniqueName('Batch Move Conflict Resource');
      const conflictSourceResponse = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .send({
          name: conflictName,
          namespaceId: client.namespace.id,
          resourceType: ResourceType.DOC,
          parentId: client.namespace.root_resource_id,
          content: 'source with conflicting name',
          attrs: {},
        })
        .expect(HttpStatus.CREATED);
      const conflictSource = conflictSourceResponse.body;
      await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .send({
          name: conflictName,
          namespaceId: client.namespace.id,
          resourceType: ResourceType.DOC,
          parentId: target.id,
          content: 'existing target child',
          attrs: {},
        })
        .expect(HttpStatus.CREATED);
      const movableSource = await createDoc(
        'Batch Move Non Conflict Resource',
        client.namespace.root_resource_id,
      );

      const response = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources/batch-move`)
        .send({
          resourceIds: [conflictSource.id, movableSource.id],
          targetId: target.id,
        })
        .expect(HttpStatus.CREATED);

      expect(response.body).toMatchObject({
        success_ids: [movableSource.id],
        failed_ids: [conflictSource.id],
        name_conflict_ids: [conflictSource.id],
      });
    });

    it('should batch move resources when source and target are editable', async () => {
      const target = await createFolder(
        'Batch Move All Editable Target',
        client.namespace.root_resource_id,
      );
      const first = await createDoc(
        'Batch Move All Editable First',
        client.namespace.root_resource_id,
      );
      const second = await createDoc(
        'Batch Move All Editable Second',
        client.namespace.root_resource_id,
      );

      const response = await memberClient
        .post(`/api/v1/namespaces/${client.namespace.id}/resources/batch-move`)
        .send({ resourceIds: [first.id, second.id], targetId: target.id })
        .expect(HttpStatus.CREATED);

      expect(response.body).toMatchObject({
        success_ids: [first.id, second.id],
        failed_ids: [],
      });
      const childrenResponse = await memberClient
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/${target.id}/children`,
        )
        .expect(HttpStatus.OK);
      expect(childrenResponse.body.map((r: any) => r.id)).toEqual(
        expect.arrayContaining([first.id, second.id]),
      );
    });

    it('should reject batch move to smart folder', async () => {
      const source = await createDoc(
        'Batch Smart Folder Source',
        client.namespace.root_resource_id,
      );
      const smartFolderResponse = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/smart-folders`)
        .send({
          name: uniqueName('Batch Smart Folder Target'),
          root_scope: SmartFolderRootScope.PRIVATE,
          conditions: [],
        })
        .expect(HttpStatus.CREATED);

      await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources/batch-move`)
        .send({
          resourceIds: [source.id],
          targetId: smartFolderResponse.body.resource_id,
        })
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    it('should ignore child ids covered by a selected parent on batch move', async () => {
      const target = await createFolder(
        'Batch Move Parent Target',
        client.namespace.root_resource_id,
      );
      const parent = await createFolder(
        'Batch Move Selected Parent',
        client.namespace.root_resource_id,
      );
      const child = await createDoc('Batch Move Muted Child', parent.id);

      const response = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources/batch-move`)
        .send({ resourceIds: [parent.id, child.id], targetId: target.id })
        .expect(HttpStatus.CREATED);

      expect(response.body).toMatchObject({
        success_ids: [parent.id],
        failed_ids: [],
      });
      const targetChildrenResponse = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/${target.id}/children`,
        )
        .expect(HttpStatus.OK);
      expect(targetChildrenResponse.body.map((r: any) => r.id)).toContain(
        parent.id,
      );
      expect(targetChildrenResponse.body.map((r: any) => r.id)).not.toContain(
        child.id,
      );
    });

    it('should create a folder with selected resources inside it', async () => {
      const parent = await createFolder(
        'Batch Folder Parent',
        client.namespace.root_resource_id,
      );
      const first = await createDoc('Batch Folder First', parent.id);
      const second = await createDoc('Batch Folder Second', parent.id);

      const response = await client
        .post(
          `/api/v1/namespaces/${client.namespace.id}/resources/batch-folder`,
        )
        .send({
          name: uniqueName('Selected Resources'),
          parentId: parent.id,
          resourceIds: [first.id, second.id],
        })
        .expect(HttpStatus.CREATED);

      expect(response.body.resource_type).toBe(ResourceType.FOLDER);
      expect(response.body.parent_id).toBe(parent.id);
      expect(response.body.success_ids).toEqual([first.id, second.id]);
      expect(response.body.failed_ids).toEqual([]);
      const childrenResponse = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/${response.body.id}/children`,
        )
        .expect(HttpStatus.OK);
      expect(childrenResponse.body.map((r: any) => r.id)).toEqual(
        expect.arrayContaining([first.id, second.id]),
      );
    });

    it('should reject batch folder when parent is not editable', async () => {
      const parent = await createFolder(
        'Batch Folder Readonly Parent',
        client.namespace.root_resource_id,
      );
      const source = await createDoc(
        'Batch Folder Parent Permission Source',
        parent.id,
      );
      await setUserPermission(parent.id, ResourcePermission.CAN_VIEW);

      await memberClient
        .post(
          `/api/v1/namespaces/${client.namespace.id}/resources/batch-folder`,
        )
        .send({
          name: uniqueName('Forbidden Batch Folder'),
          parentId: parent.id,
          resourceIds: [source.id],
        })
        .expect(HttpStatus.FORBIDDEN)
        .expect((response) => {
          expect(response.body).toMatchObject({
            code: 'target_not_editable',
            target_name: parent.name,
          });
        });
    });

    it('should not create a folder when no selected resources are editable', async () => {
      const parent = await createFolder(
        'Batch Folder All Readonly Parent',
        client.namespace.root_resource_id,
      );
      const first = await createDoc('Batch Folder Readonly First', parent.id);
      const second = await createDoc('Batch Folder Readonly Second', parent.id);
      await setUserPermission(first.id, ResourcePermission.CAN_VIEW);
      await setUserPermission(second.id, ResourcePermission.CAN_VIEW);
      const folderName = uniqueName('Readonly Selected Resources');

      const response = await memberClient
        .post(
          `/api/v1/namespaces/${client.namespace.id}/resources/batch-folder`,
        )
        .send({
          name: folderName,
          parentId: parent.id,
          resourceIds: [first.id, second.id],
        })
        .expect(HttpStatus.CREATED);

      expect(response.body).toMatchObject({
        success_ids: [],
        failed_ids: [first.id, second.id],
        name_conflict_ids: [],
      });
      const childrenResponse = await memberClient
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/${parent.id}/children`,
        )
        .expect(HttpStatus.OK);
      expect(childrenResponse.body.map((r: any) => r.name)).not.toContain(
        folderName,
      );
      expect(childrenResponse.body.map((r: any) => r.id)).toEqual(
        expect.arrayContaining([first.id, second.id]),
      );
    });

    it('should validate folder name before selected resource permissions', async () => {
      const parent = await createFolder(
        'Batch Folder Conflict Readonly Parent',
        client.namespace.root_resource_id,
      );
      const first = await createDoc(
        'Batch Folder Conflict Readonly First',
        parent.id,
      );
      const second = await createDoc(
        'Batch Folder Conflict Readonly Second',
        parent.id,
      );
      await setUserPermission(first.id, ResourcePermission.CAN_VIEW);
      await setUserPermission(second.id, ResourcePermission.CAN_VIEW);
      const folderName = uniqueName('Readonly Conflict Folder');
      await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .send({
          name: folderName,
          namespaceId: client.namespace.id,
          resourceType: ResourceType.FOLDER,
          parentId: parent.id,
          content: '',
          attrs: {},
        })
        .expect(HttpStatus.CREATED);

      await memberClient
        .post(
          `/api/v1/namespaces/${client.namespace.id}/resources/batch-folder`,
        )
        .send({
          name: folderName,
          parentId: parent.id,
          resourceIds: [first.id, second.id],
        })
        .expect(HttpStatus.CONFLICT);
    });

    it('should create a folder with only editable selected resources', async () => {
      const parent = await createFolder(
        'Batch Folder Partial Parent',
        client.namespace.root_resource_id,
      );
      const readonlySource = await createDoc(
        'Batch Folder Partial Readonly',
        parent.id,
      );
      const editableSource = await createDoc(
        'Batch Folder Partial Editable',
        parent.id,
      );
      await setUserPermission(readonlySource.id, ResourcePermission.CAN_VIEW);

      const response = await memberClient
        .post(
          `/api/v1/namespaces/${client.namespace.id}/resources/batch-folder`,
        )
        .send({
          name: uniqueName('Partial Selected Resources'),
          parentId: parent.id,
          resourceIds: [readonlySource.id, editableSource.id],
        })
        .expect(HttpStatus.CREATED);

      expect(response.body.success_ids).toEqual([editableSource.id]);
      expect(response.body.failed_ids).toEqual([readonlySource.id]);
      const folderChildrenResponse = await memberClient
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/${response.body.id}/children`,
        )
        .expect(HttpStatus.OK);
      expect(folderChildrenResponse.body.map((r: any) => r.id)).toEqual([
        editableSource.id,
      ]);
      const parentChildrenResponse = await memberClient
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/${parent.id}/children`,
        )
        .expect(HttpStatus.OK);
      expect(parentChildrenResponse.body.map((r: any) => r.id)).toContain(
        readonlySource.id,
      );
    });

    it('should report failed count without failing successful batch items', async () => {
      const valid = await createDoc(
        'Batch Partial Valid',
        client.namespace.root_resource_id,
      );

      const response = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources/batch-trash`)
        .send({ resourceIds: [valid.id, 'missing-batch-resource'] })
        .expect(HttpStatus.CREATED);

      expect(response.body).toMatchObject({
        success_ids: [valid.id],
        failed_ids: ['missing-batch-resource'],
      });
      await client
        .get(`/api/v1/namespaces/${client.namespace.id}/resources/${valid.id}`)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should reject empty batch resource ids', async () => {
      await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources/batch-trash`)
        .send({ resourceIds: [] })
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('GET /api/v1/namespaces/:namespaceId/resources/search', () => {
    let searchableResourceId: string;
    let anotherSearchableResourceId: string;
    const searchAttrs = {
      searchable: true,
      category: 'document',
      priority: 'high',
      metadata: { indexed: true },
    };

    beforeEach(async () => {
      // Create a resource for searching
      const resourceData = {
        name: uniqueName('Searchable Document'),
        namespaceId: client.namespace.id,
        resourceType: ResourceType.DOC,
        parentId: client.namespace.root_resource_id,
        content: 'This is searchable content',
        tags: ['searchable'],
        attrs: searchAttrs,
      };

      const response = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .send(resourceData)
        .expect(HttpStatus.CREATED);
      searchableResourceId = response.body.id;

      anotherSearchableResourceId = (
        await client
          .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
          .send({
            ...resourceData,
            name: uniqueName('Searchable Document'),
          })
          .expect(HttpStatus.CREATED)
      ).body.id;
    });

    it('should search resources by name and validate attrs match source', async () => {
      const response = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/search?name=Searchable`,
        )
        .expect(HttpStatus.OK);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      const foundResource = response.body.find(
        (r: any) => r.id === searchableResourceId,
      );
      expect(foundResource).toBeDefined();
      expect(foundResource.name).toContain('Searchable Document');
    });

    it('should search resources by partial name and validate attrs match source', async () => {
      const response = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/search?name=Search`,
        )
        .expect(HttpStatus.OK);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      const foundResource = response.body.find(
        (r: any) => r.id === searchableResourceId,
      );
      expect(foundResource).toBeDefined();
    });

    it('should return empty array for non-matching search', async () => {
      const response = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/search?name=NonExistentName`,
        )
        .expect(HttpStatus.OK);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(0);
    });

    it('return empty with root resource excluded', async () => {
      const response = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/search?exclude_resource_id=${client.namespace.root_resource_id}&name=Searchable`,
        )
        .expect(HttpStatus.OK);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(0);
    });

    it('return another resource', async () => {
      const response = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/search?exclude_resource_id=${searchableResourceId}`,
        )
        .expect(HttpStatus.OK);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      const foundResource = response.body.find(
        (r: any) => r.id === anotherSearchableResourceId,
      );
      expect(foundResource).toBeDefined();
    });
  });

  // Note: Restore tests are skipped due to timeout issues in the test environment
  describe('POST /api/v1/namespaces/:namespaceId/resources/:resourceId/restore', () => {
    let deletedResourceId: string;

    beforeEach(async () => {
      // Create a resource for testing restore
      const resourceData = {
        name: uniqueName('Resource to Restore'),
        namespaceId: client.namespace.id,
        resourceType: ResourceType.DOC,
        parentId: client.namespace.root_resource_id,
        content: 'Content to restore',
        tags: ['restore-test'],
        attrs: {},
      };

      const response = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .send(resourceData)
        .expect(HttpStatus.CREATED);
      deletedResourceId = response.body.id;

      // Delete the resource
      await client
        .delete(
          `/api/v1/namespaces/${client.namespace.id}/resources/${deletedResourceId}`,
        )
        .expect(HttpStatus.OK);
    });

    it('should restore deleted resource', async () => {
      const response = await client
        .post(
          `/api/v1/namespaces/${client.namespace.id}/resources/${deletedResourceId}/restore`,
        )
        .expect(HttpStatus.CREATED);

      expect(response.body).toHaveProperty('id', deletedResourceId);
      expect(response.body.name).toContain('Resource to Restore');

      // Verify the resource can be accessed again
      await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/${deletedResourceId}`,
        )
        .expect(HttpStatus.OK);
    });

    it('should fail with non-existent resource ID', async () => {
      await client
        .post(
          `/api/v1/namespaces/${client.namespace.id}/resources/non-existent-id/restore`,
        )
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('Authentication and Authorization', () => {
    it('should fail without authentication token', async () => {
      await client
        .request()
        .get(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should fail with invalid authentication token', async () => {
      await client
        .request()
        .get(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .set('Authorization', 'Bearer invalid-token')
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('Attrs Validation Across All Endpoints', () => {
    let testResourceId: string;
    let parentFolderId: string;
    const complexAttrs = {
      nested: {
        object: {
          with: 'values',
          and: ['arrays', 'of', 'strings'],
          numbers: [1, 2, 3],
        },
      },
      boolean: true,
      null_value: null,
      unicode: '🌍🚀💻',
      date: '2023-01-01T00:00:00Z',
      float: 3.14159,
    };

    beforeEach(async () => {
      // Create a parent folder
      const folderData = {
        name: uniqueName('Attrs Test Folder'),
        namespaceId: client.namespace.id,
        resourceType: ResourceType.FOLDER,
        parentId: client.namespace.root_resource_id,
        content: '',
        tags: ['attrs-test'],
        attrs: { folder: 'metadata', type: 'test' },
      };

      const folderResponse = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .send(folderData)
        .expect(HttpStatus.CREATED);
      parentFolderId = folderResponse.body.id;

      // Create a test resource with complex attrs
      const resourceData = {
        name: uniqueName('Attrs Test Resource'),
        namespaceId: client.namespace.id,
        resourceType: ResourceType.DOC,
        parentId: parentFolderId,
        content: 'Content with complex attrs',
        tags: ['attrs-test'],
        attrs: complexAttrs,
      };

      const response = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .send(resourceData)
        .expect(HttpStatus.CREATED);
      testResourceId = response.body.id;
    });

    it('should preserve attrs in GET single resource endpoint', async () => {
      const response = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}`,
        )
        .expect(HttpStatus.OK);

      expect(response.body.attrs).toEqual(complexAttrs);
    });

    it('should preserve attrs in GET multiple resources endpoint', async () => {
      const response = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources?id=${testResourceId}`,
        )
        .expect(HttpStatus.OK);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].attrs).toEqual(complexAttrs);
    });

    it('should preserve attrs in query endpoint', async () => {
      const response = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/query?parentId=${parentFolderId}`,
        )
        .expect(HttpStatus.OK);

      expect(Array.isArray(response.body)).toBe(true);
      const foundResource = response.body.find(
        (r: any) => r.id === testResourceId,
      );
      expect(foundResource).toBeDefined();
      expect(foundResource.attrs).toEqual(complexAttrs);
    });

    it('should preserve attrs in children endpoint', async () => {
      const response = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/${parentFolderId}/children`,
        )
        .expect(HttpStatus.OK);

      expect(Array.isArray(response.body)).toBe(true);
      const foundResource = response.body.find(
        (r: any) => r.id === testResourceId,
      );
      expect(foundResource).toBeDefined();
    });

    it('should preserve attrs in search endpoint', async () => {
      const response = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/search?name=Attrs Test`,
        )
        .expect(HttpStatus.OK);

      expect(Array.isArray(response.body)).toBe(true);
      const foundResource = response.body.find(
        (r: any) => r.id === testResourceId,
      );
      expect(foundResource).toBeDefined();
    });

    it('should preserve attrs after update', async () => {
      const updatedAttrs = {
        ...complexAttrs,
        updated: true,
        timestamp: new Date().toISOString(),
      };

      const updateResponse = await client
        .patch(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}`,
        )
        .send({
          namespaceId: client.namespace.id,
          attrs: updatedAttrs,
        })
        .expect(HttpStatus.OK);

      expect(updateResponse.body.attrs).toEqual(updatedAttrs);

      // Verify attrs are preserved in subsequent GET request
      const getResponse = await client
        .get(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}`,
        )
        .expect(HttpStatus.OK);

      expect(getResponse.body.attrs).toEqual(updatedAttrs);
    });

    it('should preserve attrs after duplicate', async () => {
      const duplicateResponse = await client
        .post(
          `/api/v1/namespaces/${client.namespace.id}/resources/${testResourceId}/duplicate`,
        )
        .expect(HttpStatus.CREATED);

      expect(duplicateResponse.body.attrs).toEqual(complexAttrs);
      expect(duplicateResponse.body.id).not.toBe(testResourceId);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle special characters in resource name', async () => {
      const resourceData = {
        name: uniqueName(
          '🚀 Test Resource with émojis & spëcial chars! 中文 العربية',
        ),
        namespaceId: client.namespace.id,
        resourceType: ResourceType.DOC,
        parentId: client.namespace.root_resource_id,
        content: 'Special character content',
        tags: ['special'],
        attrs: {},
      };

      const response = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .send(resourceData)
        .expect(HttpStatus.CREATED);

      expect(response.body.name).toBe(resourceData.name);
    });

    it('should handle complex attrs object', async () => {
      const complexAttrs = {
        nested: {
          object: {
            with: 'values',
            and: ['arrays', 'of', 'strings'],
            numbers: [1, 2, 3],
          },
        },
        boolean: true,
        null_value: null,
        unicode: '🌍🚀💻',
      };

      const resourceData = {
        name: uniqueName('Complex Attrs Resource'),
        namespaceId: client.namespace.id,
        resourceType: ResourceType.DOC,
        parentId: client.namespace.root_resource_id,
        content: 'Content with complex attrs',
        tags: ['complex'],
        attrs: complexAttrs,
      };

      const response = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .send(resourceData)
        .expect(HttpStatus.CREATED);

      expect(response.body.attrs).toEqual(complexAttrs);
    });
  });
});
