import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';

import { NamespaceResourcesService } from './namespace-resources.service';

describe('NamespaceResourcesService', () => {
  const namespaceId = 'namespace-1';
  const resourceId = 'smart-folder-1';
  const userId = 'user-1';

  function createService() {
    const resourcesService = {
      getParentResourcesOrFail: jest.fn(),
      getChildren: jest.fn(),
      resourceFilter: jest.fn(),
    };
    const permissionsService = {
      batchGetHasChildren: jest.fn(),
      getCurrentPermissions: jest.fn(),
    };
    const smartFoldersService = {
      listChildrenWithTotal: jest.fn(),
    };
    const resourceSortPreferenceService = {
      getSortOptions: jest.fn().mockResolvedValue({}),
    };
    const service = new NamespaceResourcesService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      permissionsService as any,
      {} as any,
      {} as any,
      resourcesService as any,
      {} as any,
      {} as any,
      {} as any,
      resourceSortPreferenceService as any,
      smartFoldersService as any,
      {} as any,
    );

    return {
      permissionsService,
      resourcesService,
      service,
      smartFoldersService,
    };
  }

  it('delegates smart folder children to SmartFoldersService virtual list', async () => {
    const { resourcesService, service, smartFoldersService } = createService();
    const children = [
      {
        id: 'doc-1',
        name: '命中文档',
        resourceType: ResourceType.DOC,
      },
    ];
    // getParentResourcesOrFail returns the chain target-first ([target, ..., root]).
    resourcesService.getParentResourcesOrFail.mockResolvedValue([
      {
        id: resourceId,
        resourceType: ResourceType.SMART_FOLDER,
      },
      {
        id: 'private-root',
        resourceType: ResourceType.FOLDER,
      },
    ]);
    smartFoldersService.listChildrenWithTotal.mockResolvedValue({
      resources: children,
      total: children.length,
    });

    const result = await service.listChildren(namespaceId, resourceId, userId, {
      limit: 10,
      offset: 0,
    });

    expect(smartFoldersService.listChildrenWithTotal).toHaveBeenCalledWith(
      userId,
      namespaceId,
      resourceId,
      { limit: 10, offset: 0 },
    );
    expect(resourcesService.getChildren).not.toHaveBeenCalled();
    expect(result).toBe(children);
  });

  it('returns an empty filter result when no resources are accessible', async () => {
    const { resourcesService, service } = createService();

    await expect(
      service.resourceFilter(namespaceId, [], {
        resourceTypes: [ResourceType.SMART_FOLDER],
      }),
    ).resolves.toEqual({ resources: [], total: 0 });
    expect(resourcesService.resourceFilter).not.toHaveBeenCalled();
  });

  it('batch checks visible child markers for every paged resource', async () => {
    const { permissionsService, resourcesService, service } = createService();
    const now = new Date('2026-08-25T00:00:00.000Z');
    const target = {
      id: resourceId,
      parentId: 'private-root',
      resourceType: ResourceType.FOLDER,
      globalPermission: ResourcePermission.FULL_ACCESS,
    };
    const root = {
      id: 'private-root',
      parentId: null,
      resourceType: ResourceType.FOLDER,
      globalPermission: ResourcePermission.FULL_ACCESS,
    };
    const children = ['folder-with-child', 'empty-folder'].map((id) => ({
      id,
      parentId: resourceId,
      name: id,
      resourceType: ResourceType.FOLDER,
      globalPermission: null,
      attrs: {},
      content: '',
      createdAt: now,
      updatedAt: now,
      fileId: null,
      tagIds: [],
      manualSortInitializedAt: null,
    }));
    resourcesService.getParentResourcesOrFail.mockResolvedValue([target, root]);
    resourcesService.getChildren.mockResolvedValue(children);
    permissionsService.getCurrentPermissions.mockResolvedValue(
      new Map(
        [target, root, ...children].map((resource) => [
          resource.id,
          ResourcePermission.CAN_VIEW,
        ]),
      ),
    );
    permissionsService.batchGetHasChildren.mockResolvedValue(
      new Map([
        ['folder-with-child', true],
        ['empty-folder', false],
      ]),
    );

    const result = await service.listChildren(namespaceId, resourceId, userId);

    expect(resourcesService.getChildren).toHaveBeenCalledTimes(1);
    expect(permissionsService.batchGetHasChildren).toHaveBeenCalledWith(
      namespaceId,
      userId,
      expect.arrayContaining([
        expect.objectContaining({ id: 'folder-with-child' }),
        expect.objectContaining({ id: 'empty-folder' }),
      ]),
      [target, root],
      undefined,
    );
    expect(permissionsService.getCurrentPermissions).toHaveBeenCalledTimes(1);
    expect(
      result.map((resource) => [resource.id, resource.hasChildren]),
    ).toEqual([
      ['folder-with-child', true],
      ['empty-folder', false],
    ]);
  });
});
