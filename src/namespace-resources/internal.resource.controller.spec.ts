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
});
