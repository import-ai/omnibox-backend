import {
  toPrivateSearchResource,
  toPrivateSearchResourceType,
  VisibleResourcesService,
} from 'omniboxd/namespace-resources/visible-resources.service';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';

function createService(mocks: {
  configService?: Record<string, jest.Mock>;
  namespaceResourcesService?: Record<string, jest.Mock>;
  resourcesService?: Record<string, jest.Mock>;
  smartFoldersService?: Record<string, jest.Mock>;
}) {
  return new VisibleResourcesService(
    (mocks.configService ?? { get: jest.fn() }) as any,
    (mocks.namespaceResourcesService ?? {
      permissionFilter: jest.fn((_n, _u, resources) =>
        Promise.resolve(resources),
      ),
    }) as any,
    (mocks.resourcesService ?? {
      getResourceMeta: jest.fn().mockResolvedValue(undefined),
    }) as any,
    (mocks.smartFoldersService ?? { listChildren: jest.fn() }) as any,
  );
}

describe('visible resource mapping', () => {
  it.each([
    [ResourceType.FOLDER, 'folder'],
    [ResourceType.SMART_FOLDER, 'folder'],
    [ResourceType.RSS_FOLDER, 'folder'],
    [ResourceType.DOC, 'resource'],
  ])('maps %s to %s', (resourceType, expected) => {
    expect(toPrivateSearchResourceType(resourceType)).toBe(expected);
  });

  it('maps a resource to the private search shape', () => {
    expect(
      toPrivateSearchResource({
        id: 'resource-id',
        name: 'Name',
        resourceType: ResourceType.DOC,
      }),
    ).toEqual({ id: 'resource-id', name: 'Name', type: 'resource' });
  });

  it('falls back to an empty name', () => {
    expect(
      toPrivateSearchResource({
        id: 'resource-id',
        name: undefined as any,
        resourceType: ResourceType.DOC,
      }),
    ).toEqual({ id: 'resource-id', name: '', type: 'resource' });
  });
});

describe('VisibleResourcesService', () => {
  it('expands an empty request to every resource the user can reach', async () => {
    const namespaceResourcesService = {
      getAllResourcesByUser: jest.fn().mockResolvedValue([
        { id: 'doc-id', name: 'Doc', resourceType: ResourceType.DOC },
        { id: 'folder-id', name: 'Folder', resourceType: ResourceType.FOLDER },
      ]),
    };

    const result = await createService({
      namespaceResourcesService,
    }).getVisibleResources('namespace-id', 'user-id', []);

    expect(
      namespaceResourcesService.getAllResourcesByUser,
    ).toHaveBeenCalledWith('user-id', 'namespace-id');
    expect(result).toEqual([
      { id: 'doc-id', name: 'Doc', type: 'resource' },
      { id: 'folder-id', name: 'Folder', type: 'folder' },
    ]);
  });

  it('honors OBB_ASK_EXPAND_EMPTY_VISIBLE_RESOURCES=false', async () => {
    const namespaceResourcesService = {
      getAllResourcesByUser: jest.fn(),
    };

    const result = await createService({
      configService: { get: jest.fn().mockReturnValue('false') },
      namespaceResourcesService,
    }).getVisibleResources('namespace-id', 'user-id', []);

    expect(result).toEqual([]);
    expect(
      namespaceResourcesService.getAllResourcesByUser,
    ).not.toHaveBeenCalled();
  });

  it('filters requested resources and expands folders against the input list', async () => {
    const folder = {
      id: 'folder-id',
      name: 'Folder',
      type: 'folder' as const,
    };
    const denied = {
      id: 'denied-id',
      name: 'Denied',
      type: 'resource' as const,
    };
    const namespaceResourcesService = {
      permissionFilter: jest
        .fn()
        .mockImplementation((_n, _u, resources) =>
          Promise.resolve(
            resources.filter((resource) => resource.id !== 'denied-id'),
          ),
        ),
      getAllSubResourcesByUser: jest
        .fn()
        .mockResolvedValue([
          { id: 'child-id', name: 'Child', resourceType: ResourceType.DOC },
        ]),
    };
    const resourcesService = {
      getResourceMeta: jest
        .fn()
        .mockResolvedValue({ resourceType: ResourceType.FOLDER }),
    };
    const smartFoldersService = { listChildren: jest.fn() };

    const result = await createService({
      namespaceResourcesService,
      resourcesService,
      smartFoldersService,
    }).getVisibleResources('namespace-id', 'user-id', [folder, denied]);

    expect(namespaceResourcesService.permissionFilter).toHaveBeenCalledWith(
      'namespace-id',
      'user-id',
      [folder, denied],
    );
    expect(
      namespaceResourcesService.getAllSubResourcesByUser,
    ).toHaveBeenCalledWith('user-id', 'namespace-id', 'folder-id');
    expect(smartFoldersService.listChildren).not.toHaveBeenCalled();
    // The input folder is annotated in place, exactly as before the move.
    expect(folder).toEqual({
      id: 'folder-id',
      name: 'Folder',
      type: 'folder',
      child_ids: ['child-id'],
    });
    expect(result).toEqual([
      folder,
      { id: 'child-id', name: 'Child', type: 'resource' },
    ]);
  });

  it('expands smart folders through the smart folder service', async () => {
    const folder = {
      id: 'smart-folder-id',
      name: 'Smart folder',
      type: 'folder' as const,
    };
    const namespaceResourcesService = {
      permissionFilter: jest
        .fn()
        .mockImplementation((_n, _u, resources) =>
          Promise.resolve([...resources]),
        ),
      getAllSubResourcesByUser: jest.fn(),
    };
    const resourcesService = {
      getResourceMeta: jest
        .fn()
        .mockResolvedValue({ resourceType: ResourceType.SMART_FOLDER }),
    };
    const smartFoldersService = {
      listChildren: jest
        .fn()
        .mockResolvedValue([
          { id: 'matched-id', name: 'Matched', resourceType: ResourceType.DOC },
        ]),
    };

    const result = await createService({
      namespaceResourcesService,
      resourcesService,
      smartFoldersService,
    }).getVisibleResources('namespace-id', 'user-id', [folder]);

    expect(smartFoldersService.listChildren).toHaveBeenCalledWith(
      'user-id',
      'namespace-id',
      'smart-folder-id',
    );
    expect(
      namespaceResourcesService.getAllSubResourcesByUser,
    ).not.toHaveBeenCalled();
    expect(result).toEqual([
      { ...folder, child_ids: ['matched-id'] },
      { id: 'matched-id', name: 'Matched', type: 'resource' },
    ]);
  });

  it('leaves plain resources unexpanded', async () => {
    const resource = {
      id: 'doc-id',
      name: 'Doc',
      type: 'resource' as const,
    };
    const namespaceResourcesService = {
      permissionFilter: jest
        .fn()
        .mockImplementation((_n, _u, resources) =>
          Promise.resolve([...resources]),
        ),
    };
    const resourcesService = { getResourceMeta: jest.fn() };

    const result = await createService({
      namespaceResourcesService,
      resourcesService,
    }).getVisibleResources('namespace-id', 'user-id', [resource]);

    expect(resourcesService.getResourceMeta).not.toHaveBeenCalled();
    expect(result).toEqual([resource]);
  });
});
