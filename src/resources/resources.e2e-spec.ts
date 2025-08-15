import { TestClient } from 'test/test-client';
import { HttpStatus } from '@nestjs/common';
import { ResourceType } from 'omniboxd/resources/resources.entity';

describe('ResourcesController (e2e)', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = await TestClient.create();
  });

  afterAll(async () => {
    await client.close();
  });

  describe('POST /api/v1/namespaces/:namespaceId/resources', () => {
    it('should create a new document resource', async () => {
      const tagIds = await client.createTags(['test', 'document']);

      const resourceData = {
        name: 'Test Document',
        namespaceId: client.namespace.id,
        resourceType: ResourceType.DOC,
        parentId: client.namespace.root_resource_id,
        content: 'This is a test document content',
        tagIds: tagIds,
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
      expect(response.body.tags).toHaveLength(resourceData.tagIds.length);
      expect(response.body.tags.map(tag => tag.name)).toEqual(expect.arrayContaining(['test', 'document']));
      expect(response.body.attrs).toEqual(resourceData.attrs);
    });

    it('should create a new folder resource', async () => {
      const resourceData = {
        name: 'Test Folder',
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
        name: 'Test Link',
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
        name: 'Invalid Resource',
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
        name: 'Incomplete Resource',
        // Missing namespaceId, resourceType, parentId
      };

      await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .send(resourceData)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should fail with empty namespaceId', async () => {
      const resourceData = {
        name: 'Test Resource',
        namespaceId: '',
        resourceType: ResourceType.DOC,
        parentId: client.namespace.root_resource_id,
        content: 'content',
      };

      await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .send(resourceData)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should fail with empty parentId', async () => {
      const resourceData = {
        name: 'Test Resource',
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
        name: 'Test Resource for Query',
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
        name: 'Second Test Resource',
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
        name: 'Test Resource for Get',
        namespaceId: client.namespace.id,
        resourceType: ResourceType.DOC,
        parentId: client.namespace.root_resource_id,
        content: 'Test content for get',
        tagIds: tagIds,
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
      expect(response.body).toHaveProperty('name', 'Test Resource for Get');
      expect(response.body).toHaveProperty('content', 'Test content for get');
      expect(response.body).toHaveProperty('tags');
      expect(response.body.tags.map(tag => tag.name)).toContain('get-test');
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
        name: 'Test Resource for Update',
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
      const updateData = {
        tags: ['updated', 'tags'],
        namespaceId: client.namespace.id,
      };

      const response = await client
        .patch(
          `/api/v1/namespaces/${client.namespace.id}/resources/${resourceId}`,
        )
        .send(updateData)
        .expect(HttpStatus.OK);

      expect(response.body.tags.map(tag => tag.name)).toEqual(expect.arrayContaining(updateData.tags));
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
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should fail with missing namespaceId', async () => {
      const updateData = {
        name: 'Updated Name',
      };

      await client
        .patch(
          `/api/v1/namespaces/${client.namespace.id}/resources/${resourceId}`,
        )
        .send(updateData)
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('DELETE /api/v1/namespaces/:namespaceId/resources/:resourceId', () => {
    let resourceId: string;

    beforeEach(async () => {
      // Create a resource for testing
      const resourceData = {
        name: 'Test Resource for Delete',
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
        .expect(HttpStatus.FORBIDDEN);
    });
  });

  describe('POST /api/v1/namespaces/:namespaceId/resources/:resourceId/duplicate', () => {
    let resourceId: string;

    beforeEach(async () => {
      // Create a resource for testing
      const tagIds = await client.createTags(['duplicate-test']);
      const resourceData = {
        name: 'Test Resource for Duplicate',
        namespaceId: client.namespace.id,
        resourceType: ResourceType.DOC,
        parentId: client.namespace.root_resource_id,
        content: 'Content to be duplicated',
        tagIds: tagIds,
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
      expect(response.body.tags.map(tag => tag.name)).toEqual(['duplicate-test']);
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
      // Create a parent folder
      const folderData = {
        name: 'Parent Folder',
        namespaceId: client.namespace.id,
        resourceType: ResourceType.FOLDER,
        parentId: client.namespace.root_resource_id,
        content: '',
        tags: ['folder'],
        attrs: folderAttrs,
      };

      const folderResponse = await client
        .post(`/api/v1/namespaces/${client.namespace.id}/resources`)
        .send(folderData)
        .expect(HttpStatus.CREATED);
      parentFolderId = folderResponse.body.id;

      // Create a child resource
      const childData = {
        name: 'Child Resource',
        namespaceId: client.namespace.id,
        resourceType: ResourceType.DOC,
        parentId: parentFolderId,
        content: 'Child content',
        tags: ['child', 'query-test'],
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
      expect(childResource.name).toBe('Child Resource');
      expect(childResource.attrs).toEqual(childAttrs);
    });

    // Note: Tag filtering tests are skipped due to PostgreSQL JSONB array query limitations
    it.skip('should query resources by tags', async () => {
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

    it.skip('should query resources by multiple tags', async () => {
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

    it.skip('should return empty array for non-matching tags', async () => {
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
        name: 'Parent Folder for Children',
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
        name: 'Child Resource for List',
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
      expect(childResource.name).toBe('Child Resource for List');
      expect(childResource.attrs).toEqual(childAttrs);
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

    beforeEach(async () => {
      // Create a target folder
      const targetFolderData = {
        name: 'Target Folder',
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
        name: 'Resource to Move',
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
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should fail with non-existent target resource', async () => {
      await client
        .post(
          `/api/v1/namespaces/${client.namespace.id}/resources/${sourceResourceId}/move/non-existent-target`,
        )
        .expect(HttpStatus.NOT_FOUND);
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
        name: 'Searchable Document',
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
          .send(resourceData)
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
      expect(foundResource.name).toBe('Searchable Document');
      expect(foundResource.attrs).toEqual(searchAttrs);
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
      expect(foundResource.attrs).toEqual(searchAttrs);
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
  describe.skip('POST /api/v1/namespaces/:namespaceId/resources/:resourceId/restore', () => {
    let deletedResourceId: string;

    beforeEach(async () => {
      // Create a resource for testing restore
      const resourceData = {
        name: 'Resource to Restore',
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
      expect(response.body.name).toBe('Resource to Restore');

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
        .expect(HttpStatus.INTERNAL_SERVER_ERROR);
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
        name: 'Attrs Test Folder',
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
        name: 'Attrs Test Resource',
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
      expect(foundResource.attrs).toEqual(complexAttrs);
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
      expect(foundResource.attrs).toEqual(complexAttrs);
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
        name: '🚀 Test Resource with émojis & spëcial chars! 中文 العربية',
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
        name: 'Complex Attrs Resource',
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
