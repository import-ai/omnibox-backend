import { SmartFolderRootScope } from 'omniboxd/smart-folders/entities/smart-folder-config.entity';
import { SmartFoldersScopeService } from 'omniboxd/smart-folders/smart-folders-scope.service';

describe('SmartFoldersScopeService', () => {
  function createService() {
    const namespacesService = {
      getPrivateRootId: jest.fn().mockResolvedValue('private-root'),
      getTeamspaceRoot: jest.fn().mockResolvedValue({ id: 'team-root' }),
    };
    const resourcesService = {
      getAllSubResources: jest.fn(),
      getParentResourcesOrFail: jest.fn(),
    };
    const service = new SmartFoldersScopeService(
      namespacesService as any,
      resourcesService as any,
    );

    return { namespacesService, resourcesService, service };
  }

  it('returns only visible resources inside the requested private scope', async () => {
    const { resourcesService, service } = createService();
    resourcesService.getAllSubResources.mockResolvedValue([
      { id: 'visible-doc' },
      { id: 'hidden-doc' },
    ]);

    const result = await service.getScopedVisibleResourceIds(
      'user-id',
      'namespace-id',
      SmartFolderRootScope.PRIVATE,
      [{ id: 'visible-doc' }],
    );

    expect(result).toEqual(new Set(['private-root', 'visible-doc']));
  });

  it('checks both private and teamspace roots for all-scope membership', async () => {
    const { resourcesService, service } = createService();
    resourcesService.getParentResourcesOrFail.mockResolvedValue([
      { id: 'private-root' },
      { id: 'parent-folder' },
      { id: 'resource-id' },
    ]);

    const result = await service.isResourceInScope(
      'user-id',
      'namespace-id',
      SmartFolderRootScope.ALL,
      'resource-id',
    );

    expect(result).toBe(true);
  });
});
