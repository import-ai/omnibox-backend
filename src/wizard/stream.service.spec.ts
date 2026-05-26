import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import { StreamService } from 'omniboxd/wizard/stream.service';

function createService(mocks: {
  namespaceResourcesService?: Record<string, jest.Mock>;
  sharedResourcesService?: Record<string, jest.Mock>;
  resourcesService?: Record<string, jest.Mock>;
  smartFoldersService?: Record<string, jest.Mock>;
}) {
  return new StreamService(
    {} as any,
    {} as any,
    mocks.namespaceResourcesService as any,
    mocks.sharedResourcesService as any,
    mocks.resourcesService as any,
    mocks.smartFoldersService as any,
    {} as any,
  );
}

describe('StreamService private_search visible resources', () => {
  it('treats smart folders as folders when all visible resources are exposed', async () => {
    const namespaceResourcesService = {
      getAllResourcesByUser: jest.fn().mockResolvedValue([
        {
          id: 'smart-folder-id',
          name: 'Smart folder',
          resourceType: ResourceType.SMART_FOLDER,
        },
      ]),
    };
    const service = createService({
      namespaceResourcesService,
      resourcesService: {},
    });

    const result = await (service as any).getUserVisibleResources(
      'namespace-id',
      'user-id',
      [],
    );

    expect(result).toEqual([
      {
        id: 'smart-folder-id',
        name: 'Smart folder',
        type: 'folder',
      },
    ]);
  });

  it('expands selected smart folders through the virtual smart-folder children list', async () => {
    const namespaceResourcesService = {
      permissionFilter: jest.fn((_namespaceId, _userId, resources) => [
        ...resources,
      ]),
      getAllSubResourcesByUser: jest.fn(),
    };
    const resourcesService = {
      getResourceMeta: jest.fn().mockResolvedValue({
        id: 'smart-folder-id',
        name: 'Smart folder',
        resourceType: ResourceType.SMART_FOLDER,
      }),
    };
    const smartFoldersService = {
      listChildren: jest.fn().mockResolvedValue([
        {
          id: 'matched-doc-id',
          name: 'Matched doc',
          resourceType: ResourceType.DOC,
        },
      ]),
    };
    const service = createService({
      namespaceResourcesService,
      resourcesService,
      smartFoldersService,
    });

    const result = await (service as any).getUserVisibleResources(
      'namespace-id',
      'user-id',
      [
        {
          id: 'smart-folder-id',
          name: 'Smart folder',
          type: 'folder',
        },
      ],
    );

    expect(smartFoldersService.listChildren).toHaveBeenCalledWith(
      'user-id',
      'namespace-id',
      'smart-folder-id',
    );
    expect(
      namespaceResourcesService.getAllSubResourcesByUser,
    ).not.toHaveBeenCalled();
    expect(result).toEqual([
      {
        id: 'smart-folder-id',
        name: 'Smart folder',
        type: 'folder',
        child_ids: ['matched-doc-id'],
      },
      {
        id: 'matched-doc-id',
        name: 'Matched doc',
        type: 'resource',
      },
    ]);
  });

  it('treats shared smart folders as folders when all shared resources are exposed', async () => {
    const sharedResourcesService = {
      getAllSharedResources: jest.fn().mockResolvedValue([
        {
          id: 'smart-folder-id',
          name: 'Smart folder',
          resourceType: ResourceType.SMART_FOLDER,
        },
        {
          id: 'matched-doc-id',
          name: 'Matched doc',
          resourceType: ResourceType.DOC,
        },
      ]),
    };
    const service = createService({
      sharedResourcesService,
      resourcesService: {},
    });

    const result = await (service as any).getShareVisibleResources(
      {
        namespaceId: 'namespace-id',
      },
      [],
    );

    expect(result).toEqual([
      {
        id: 'smart-folder-id',
        name: 'Smart folder',
        type: 'folder',
      },
      {
        id: 'matched-doc-id',
        name: 'Matched doc',
        type: 'resource',
      },
    ]);
  });

  it('expands selected shared smart folders through shared resource children', async () => {
    const sharedResourcesService = {
      getAndValidateResource: jest.fn().mockResolvedValue({
        id: 'smart-folder-id',
        resourceType: ResourceType.SMART_FOLDER,
      }),
      getSharedResourceChildren: jest.fn().mockResolvedValue([
        {
          id: 'matched-doc-id',
          name: 'Matched doc',
          resourceType: ResourceType.DOC,
        },
      ]),
    };
    const resourcesService = {
      getChildren: jest.fn(),
    };
    const service = createService({
      sharedResourcesService,
      resourcesService,
    });

    const result = await (service as any).getShareVisibleResources(
      {
        namespaceId: 'namespace-id',
      },
      [
        {
          id: 'smart-folder-id',
          name: 'Smart folder',
          type: 'folder',
        },
      ],
    );

    expect(
      sharedResourcesService.getSharedResourceChildren,
    ).toHaveBeenCalledWith(
      {
        namespaceId: 'namespace-id',
      },
      'smart-folder-id',
    );
    expect(resourcesService.getChildren).not.toHaveBeenCalled();
    expect(result).toEqual([
      {
        id: 'smart-folder-id',
        name: 'Smart folder',
        type: 'folder',
        child_ids: ['matched-doc-id'],
      },
      {
        id: 'matched-doc-id',
        name: 'Matched doc',
        type: 'resource',
      },
    ]);
  });
});
