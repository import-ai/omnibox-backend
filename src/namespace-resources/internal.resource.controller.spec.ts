import { InternalResourcesController } from 'omniboxd/namespace-resources/internal.resource.controller';

describe('InternalResourcesController visible resources', () => {
  it('filters unique ids through permissionFilter and returns ids only', async () => {
    const namespaceResourcesService = {
      permissionFilter: jest.fn().mockResolvedValue(['keep']),
    };
    const controller = new InternalResourcesController(
      namespaceResourcesService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const result = await controller.filterVisibleResources(
      'namespace-id',
      'user-id',
      {
        resourceIds: ['keep', 'deny', 'keep'],
      } as any,
    );

    expect(namespaceResourcesService.permissionFilter).toHaveBeenCalledWith(
      'namespace-id',
      'user-id',
      ['keep', 'deny'],
    );
    expect(result).toEqual({ resourceIds: ['keep'] });
  });

  it('expands the requested resources for the header user', async () => {
    const expanded = [
      {
        id: 'folder-id',
        name: 'Folder',
        type: 'folder',
        child_ids: ['doc-id'],
      },
      { id: 'doc-id', name: 'Doc', type: 'resource' },
    ];
    const visibleResourcesService = {
      getVisibleResources: jest.fn().mockResolvedValue(expanded),
    };
    const controller = new InternalResourcesController(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      visibleResourcesService as any,
    );
    const resources = [
      { id: 'folder-id', name: 'Folder', type: 'folder' as const },
    ];

    const result = await controller.expandVisibleResources(
      'namespace-id',
      'user-id',
      { resources },
    );

    expect(visibleResourcesService.getVisibleResources).toHaveBeenCalledWith(
      'namespace-id',
      'user-id',
      resources,
    );
    expect(result).toEqual({ resources: expanded });
  });
});
