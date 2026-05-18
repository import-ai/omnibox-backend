import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import { StreamService } from 'omniboxd/wizard/stream.service';

function createService(mocks: {
  namespaceResourcesService?: Record<string, jest.Mock>;
  resourcesService?: Record<string, jest.Mock>;
}) {
  return new StreamService(
    {} as any,
    {} as any,
    mocks.namespaceResourcesService as any,
    {} as any,
    mocks.resourcesService as any,
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
      listChildren: jest.fn().mockResolvedValue([
        {
          id: 'matched-doc-id',
          name: 'Matched doc',
          resourceType: ResourceType.DOC,
        },
      ]),
      getAllSubResourcesByUser: jest.fn(),
    };
    const resourcesService = {
      getResourceOrFail: jest.fn().mockResolvedValue({
        id: 'smart-folder-id',
        name: 'Smart folder',
        resourceType: ResourceType.SMART_FOLDER,
      }),
    };
    const service = createService({
      namespaceResourcesService,
      resourcesService,
    });

    const result = await (service as any).getUserVisibleResources(
      'namespace-id',
      'user-id',
      [
        {
          id: 'smart-folder-id',
          name: 'Smart folder',
          type: 'resource',
        },
      ],
    );

    expect(namespaceResourcesService.listChildren).toHaveBeenCalledWith(
      'namespace-id',
      'smart-folder-id',
      'user-id',
      {},
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
});
