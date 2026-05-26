import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import { SharedResourcesService } from 'omniboxd/shared-resources/shared-resources.service';

describe('SharedResourcesService.getSharedResourceChildren', () => {
  function createService() {
    const resourcesService = {
      getResource: jest.fn(),
      getChildren: jest.fn(),
      getAllSubResources: jest.fn(),
      batchGetParentResources: jest.fn(),
      getParentResourcesOrFail: jest.fn(),
      resourceFilter: jest.fn(),
    };
    const smartFoldersService = {
      listChildren: jest.fn().mockResolvedValue([
        {
          id: 'matched-doc-id',
          parentId: 'smart-folder-id',
          name: 'Matched doc',
          resourceType: ResourceType.DOC,
          createdAt: new Date('2026-05-18T00:00:00.000Z'),
          updatedAt: new Date('2026-05-18T00:00:00.000Z'),
          hasChildren: false,
          attrs: {
            transcript: 'hidden',
            video_info: 'hidden',
            kept: true,
          },
        },
      ]),
      isResourceMatched: jest.fn(),
    };
    const service = new SharedResourcesService(
      resourcesService as any,
      smartFoldersService as any,
      {} as any,
      { t: jest.fn((key: string) => key) } as any,
    );

    return { resourcesService, service, smartFoldersService };
  }

  it('expands a shared smart folder through matched smart-folder children', async () => {
    const { resourcesService, service, smartFoldersService } = createService();
    resourcesService.getResource.mockResolvedValue({
      id: 'smart-folder-id',
      namespaceId: 'namespace-id',
      resourceType: ResourceType.SMART_FOLDER,
    });

    const result = await service.getSharedResourceChildren(
      {
        id: 'share-id',
        namespaceId: 'namespace-id',
        resourceId: 'smart-folder-id',
        userId: 'owner-user-id',
        allResources: true,
      } as any,
      'smart-folder-id',
    );

    expect(smartFoldersService.listChildren).toHaveBeenCalledWith(
      'owner-user-id',
      'namespace-id',
      'smart-folder-id',
    );
    expect(resourcesService.getChildren).not.toHaveBeenCalled();
    expect(result).toEqual([
      expect.objectContaining({
        id: 'matched-doc-id',
        parentId: 'smart-folder-id',
        name: 'Matched doc',
        resourceType: ResourceType.DOC,
        hasChildren: false,
        attrs: { kept: true },
      }),
    ]);
  });

  it('includes matched resources when listing all resources for a shared smart folder root', async () => {
    const { resourcesService, service, smartFoldersService } = createService();
    resourcesService.getResource.mockResolvedValue({
      id: 'smart-folder-id',
      namespaceId: 'namespace-id',
      name: 'Smart folder',
      resourceType: ResourceType.SMART_FOLDER,
      createdAt: new Date('2026-05-18T00:00:00.000Z'),
      updatedAt: new Date('2026-05-18T00:00:00.000Z'),
      attrs: {},
    });
    resourcesService.getChildren.mockResolvedValue([]);
    resourcesService.getAllSubResources.mockResolvedValue([]);

    const result = await service.getAllSharedResources({
      id: 'share-id',
      namespaceId: 'namespace-id',
      resourceId: 'smart-folder-id',
      userId: 'owner-user-id',
      allResources: true,
    } as any);

    expect(smartFoldersService.listChildren).toHaveBeenCalledWith(
      'owner-user-id',
      'namespace-id',
      'smart-folder-id',
    );
    expect(resourcesService.getAllSubResources).not.toHaveBeenCalled();
    expect(result).toEqual([
      expect.objectContaining({
        id: 'smart-folder-id',
        parentId: null,
        resourceType: ResourceType.SMART_FOLDER,
      }),
      expect.objectContaining({
        id: 'matched-doc-id',
        parentId: 'smart-folder-id',
        resourceType: ResourceType.DOC,
      }),
    ]);
  });

  it('filters matched resources when shared VFS filters a smart folder root', async () => {
    const { resourcesService, service } = createService();
    resourcesService.getResource.mockResolvedValue({
      id: 'smart-folder-id',
      namespaceId: 'namespace-id',
      name: 'Smart folder',
      resourceType: ResourceType.SMART_FOLDER,
      createdAt: new Date('2026-05-18T00:00:00.000Z'),
      updatedAt: new Date('2026-05-18T00:00:00.000Z'),
      attrs: {},
    });
    resourcesService.getChildren.mockResolvedValue([]);
    resourcesService.getAllSubResources.mockResolvedValue([]);
    resourcesService.resourceFilter.mockResolvedValue({
      resources: [
        {
          id: 'matched-doc-id',
        },
      ],
      total: 1,
    });

    const result = await service.resourceFilter(
      {
        id: 'share-id',
        namespaceId: 'namespace-id',
        resourceId: 'smart-folder-id',
        userId: 'owner-user-id',
        allResources: true,
      } as any,
      'smart-folder-id',
      { namePattern: 'Matched' } as any,
    );

    expect(resourcesService.resourceFilter).toHaveBeenCalledWith(
      'namespace-id',
      ['smart-folder-id', 'matched-doc-id'],
      { namePattern: 'Matched' },
    );
    expect(result).toEqual({
      resources: [
        expect.objectContaining({
          id: 'matched-doc-id',
          parentId: 'smart-folder-id',
          resourceType: ResourceType.DOC,
        }),
      ],
      total: 1,
    });
  });

  it('builds virtual paths for matched shared smart folder resources', async () => {
    const { resourcesService, service, smartFoldersService } = createService();
    resourcesService.getResource.mockResolvedValue({
      id: 'smart-folder-id',
      namespaceId: 'namespace-id',
      name: 'Smart folder',
      resourceType: ResourceType.SMART_FOLDER,
      createdAt: new Date('2026-05-18T00:00:00.000Z'),
      updatedAt: new Date('2026-05-18T00:00:00.000Z'),
      attrs: {},
    });
    resourcesService.batchGetParentResources.mockResolvedValue(
      new Map([
        [
          'matched-doc-id',
          {
            id: 'matched-doc-id',
            parentId: 'physical-parent-id',
            name: 'Matched doc',
            resourceType: ResourceType.DOC,
            createdAt: new Date('2026-05-18T00:00:00.000Z'),
            updatedAt: new Date('2026-05-18T00:00:00.000Z'),
            attrs: {},
          },
        ],
        [
          'physical-parent-id',
          {
            id: 'physical-parent-id',
            parentId: 'namespace-root-id',
            name: 'Physical parent',
            resourceType: ResourceType.FOLDER,
            createdAt: new Date('2026-05-18T00:00:00.000Z'),
            updatedAt: new Date('2026-05-18T00:00:00.000Z'),
            attrs: {},
          },
        ],
        [
          'namespace-root-id',
          {
            id: 'namespace-root-id',
            parentId: null,
            name: '',
            resourceType: ResourceType.FOLDER,
            createdAt: new Date('2026-05-18T00:00:00.000Z'),
            updatedAt: new Date('2026-05-18T00:00:00.000Z'),
            attrs: {},
          },
        ],
      ]),
    );
    smartFoldersService.isResourceMatched.mockResolvedValue(true);

    const result = await service.batchGetResourcePath(
      {
        id: 'share-id',
        namespaceId: 'namespace-id',
        resourceId: 'smart-folder-id',
        userId: 'owner-user-id',
        allResources: true,
      } as any,
      ['matched-doc-id'],
    );

    expect(smartFoldersService.isResourceMatched).toHaveBeenCalledWith(
      'owner-user-id',
      'namespace-id',
      'smart-folder-id',
      'matched-doc-id',
    );
    expect(result.get('matched-doc-id')).toEqual([
      expect.objectContaining({
        id: 'smart-folder-id',
        name: 'Smart folder',
        resourceType: ResourceType.SMART_FOLDER,
      }),
      expect.objectContaining({
        id: 'matched-doc-id',
        name: 'Matched doc',
      }),
    ]);
  });

  it('builds virtual paths for descendants of matched shared smart folder folders', async () => {
    const { resourcesService, service, smartFoldersService } = createService();
    resourcesService.getResource.mockResolvedValue({
      id: 'smart-folder-id',
      namespaceId: 'namespace-id',
      name: 'Smart folder',
      resourceType: ResourceType.SMART_FOLDER,
      createdAt: new Date('2026-05-18T00:00:00.000Z'),
      updatedAt: new Date('2026-05-18T00:00:00.000Z'),
      attrs: {},
    });
    resourcesService.batchGetParentResources.mockResolvedValue(
      new Map([
        [
          'nested-doc-id',
          {
            id: 'nested-doc-id',
            parentId: 'matched-folder-id',
            name: 'Nested doc',
            resourceType: ResourceType.DOC,
            createdAt: new Date('2026-05-18T00:00:00.000Z'),
            updatedAt: new Date('2026-05-18T00:00:00.000Z'),
            attrs: {},
          },
        ],
        [
          'matched-folder-id',
          {
            id: 'matched-folder-id',
            parentId: 'physical-parent-id',
            name: 'Matched folder',
            resourceType: ResourceType.FOLDER,
            createdAt: new Date('2026-05-18T00:00:00.000Z'),
            updatedAt: new Date('2026-05-18T00:00:00.000Z'),
            attrs: {},
          },
        ],
        [
          'physical-parent-id',
          {
            id: 'physical-parent-id',
            parentId: 'namespace-root-id',
            name: 'Physical parent',
            resourceType: ResourceType.FOLDER,
            createdAt: new Date('2026-05-18T00:00:00.000Z'),
            updatedAt: new Date('2026-05-18T00:00:00.000Z'),
            attrs: {},
          },
        ],
        [
          'namespace-root-id',
          {
            id: 'namespace-root-id',
            parentId: null,
            name: '',
            resourceType: ResourceType.FOLDER,
            createdAt: new Date('2026-05-18T00:00:00.000Z'),
            updatedAt: new Date('2026-05-18T00:00:00.000Z'),
            attrs: {},
          },
        ],
      ]),
    );
    resourcesService.getParentResourcesOrFail.mockResolvedValue([
      {
        id: 'matched-folder-id',
        parentId: 'physical-parent-id',
        name: 'Matched folder',
        resourceType: ResourceType.FOLDER,
      },
      {
        id: 'physical-parent-id',
        parentId: 'namespace-root-id',
        name: 'Physical parent',
        resourceType: ResourceType.FOLDER,
      },
      {
        id: 'namespace-root-id',
        parentId: null,
        name: '',
        resourceType: ResourceType.FOLDER,
      },
    ]);
    smartFoldersService.isResourceMatched.mockImplementation(
      (
        _userId: string,
        _namespaceId: string,
        _smartFolderId: string,
        resourceId: string,
      ) => resourceId === 'matched-folder-id',
    );

    const result = await service.batchGetResourcePath(
      {
        id: 'share-id',
        namespaceId: 'namespace-id',
        resourceId: 'smart-folder-id',
        userId: 'owner-user-id',
        allResources: true,
      } as any,
      ['nested-doc-id'],
    );

    expect(smartFoldersService.isResourceMatched).toHaveBeenCalledWith(
      'owner-user-id',
      'namespace-id',
      'smart-folder-id',
      'nested-doc-id',
    );
    expect(smartFoldersService.isResourceMatched).toHaveBeenCalledWith(
      'owner-user-id',
      'namespace-id',
      'smart-folder-id',
      'matched-folder-id',
    );
    expect(result.get('nested-doc-id')).toEqual([
      expect.objectContaining({
        id: 'smart-folder-id',
        name: 'Smart folder',
      }),
      expect.objectContaining({
        id: 'matched-folder-id',
        name: 'Matched folder',
      }),
      expect.objectContaining({
        id: 'nested-doc-id',
        name: 'Nested doc',
      }),
    ]);
  });
});
