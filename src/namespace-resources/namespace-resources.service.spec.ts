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
    const smartFoldersService = {
      listChildren: jest.fn(),
    };
    const service = new NamespaceResourcesService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      resourcesService as any,
      {} as any,
      {} as any,
      {} as any,
      smartFoldersService as any,
    );

    return { resourcesService, service, smartFoldersService };
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
    smartFoldersService.listChildren.mockResolvedValue(children);

    const result = await service.listChildren(namespaceId, resourceId, userId, {
      limit: 10,
      offset: 0,
    });

    expect(smartFoldersService.listChildren).toHaveBeenCalledWith(
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
});
