import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import { SMART_FOLDERS_SERVICE } from 'omniboxd/smart-folders/smart-folder-entitlements.interface';
import { NamespaceResourcesService } from './namespace-resources.service';

describe('NamespaceResourcesService.listChildren', () => {
  const namespaceId = 'namespace-1';
  const resourceId = 'smart-folder-1';
  const userId = 'user-1';

  function createService() {
    const resourcesService = {
      getParentResourcesOrFail: jest.fn(),
      getChildren: jest.fn(),
    };
    const smartFoldersService = {
      listChildren: jest.fn(),
    };
    const moduleRef = {
      get: jest.fn((token) => {
        if (token === SMART_FOLDERS_SERVICE) {
          return smartFoldersService;
        }
        return undefined;
      }),
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
      {} as any,
      moduleRef as any,
    );

    return { moduleRef, resourcesService, service, smartFoldersService };
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
    resourcesService.getParentResourcesOrFail.mockResolvedValue([
      {
        id: 'private-root',
        resourceType: ResourceType.FOLDER,
      },
      {
        id: resourceId,
        resourceType: ResourceType.SMART_FOLDER,
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
});
