import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import {
  SmartFolderField,
  SmartFolderMatchMode,
  SmartFolderOperator,
  SmartFolderRootScope,
} from 'omniboxd/smart-folders/entities/smart-folder-config.entity';
import { SmartFolderExpressionService } from 'omniboxd/smart-folders/smart-folder-expression.service';
import { SmartFoldersService } from 'omniboxd/smart-folders/smart-folders.service';
import { SmartFoldersMatcherService } from 'omniboxd/smart-folders/smart-folders-matcher.service';

describe('SmartFoldersService.listChildren', () => {
  function createService() {
    const config = {
      resourceId: 'smart-folder-id',
      namespaceId: 'namespace-id',
      rootScope: SmartFolderRootScope.PRIVATE,
      matchMode: SmartFolderMatchMode.ALL,
      conditions: [
        {
          field: SmartFolderField.TITLE,
          operator: SmartFolderOperator.CONTAINS,
          value: 'matched',
        },
      ],
    };
    const smartFolderConfigRepository = {
      createQueryBuilder: jest.fn().mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(config),
      }),
    };
    const resources = [
      {
        id: 'matched-doc-id',
        name: 'Matched doc',
        parentId: 'private-root',
        namespaceId: 'namespace-id',
        resourceType: ResourceType.DOC,
        attrs: {},
        tagIds: [],
        createdAt: new Date('2026-05-18T00:00:00.000Z'),
        updatedAt: new Date('2026-05-18T00:00:00.000Z'),
      },
      {
        id: 'out-of-scope-doc-id',
        name: 'Matched but hidden doc',
        parentId: 'team-root',
        namespaceId: 'namespace-id',
        resourceType: ResourceType.DOC,
        attrs: {},
        tagIds: [],
        createdAt: new Date('2026-05-18T00:00:00.000Z'),
        updatedAt: new Date('2026-05-18T00:00:00.000Z'),
      },
      {
        id: 'smart-folder-child-id',
        name: 'Matched smart folder',
        parentId: 'private-root',
        namespaceId: 'namespace-id',
        resourceType: ResourceType.SMART_FOLDER,
        attrs: {},
        tagIds: [],
        createdAt: new Date('2026-05-18T00:00:00.000Z'),
        updatedAt: new Date('2026-05-18T00:00:00.000Z'),
      },
      {
        id: 'rss-folder-child-id',
        name: 'Matched rss folder',
        parentId: 'private-root',
        namespaceId: 'namespace-id',
        resourceType: ResourceType.RSS_FOLDER,
        attrs: {},
        tagIds: [],
        createdAt: new Date('2026-05-18T00:00:00.000Z'),
        updatedAt: new Date('2026-05-18T00:00:00.000Z'),
      },
      {
        id: 'rss-item-resource-id',
        name: 'Matched rss item resource',
        parentId: 'rss-folder-child-id',
        namespaceId: 'namespace-id',
        resourceType: ResourceType.RSS_ITEM,
        attrs: {},
        tagIds: [],
        createdAt: new Date('2026-05-18T00:00:00.000Z'),
        updatedAt: new Date('2026-05-18T00:00:00.000Z'),
      },
    ];
    const candidates = resources.filter(
      (resource) => resource.resourceType !== ResourceType.SMART_FOLDER,
    );
    const parentById = new Map([
      ['matched-doc-id', { id: 'matched-doc-id', parentId: 'private-root' }],
      ['private-root', { id: 'private-root', parentId: null }],
      [
        'out-of-scope-doc-id',
        { id: 'out-of-scope-doc-id', parentId: 'team-root' },
      ],
      ['team-root', { id: 'team-root', parentId: null }],
      [
        'rss-folder-child-id',
        { id: 'rss-folder-child-id', parentId: 'private-root' },
      ],
      [
        'rss-item-resource-id',
        { id: 'rss-item-resource-id', parentId: 'rss-folder-child-id' },
      ],
    ]);
    const queryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      distinct: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(candidates),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    const resourceRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      find: jest
        .fn()
        .mockResolvedValue(
          candidates.map((resource) => ({ id: resource.id, content: '' })),
        ),
    };
    const smartFolderResourcesService = {
      getUserVisibleResources: jest.fn(),
    };
    const permissionsService = {
      userHasPermission: jest.fn().mockResolvedValue(true),
      filterResourcesByPermission: jest
        .fn()
        .mockImplementation((_userId, _namespaceId, resources) =>
          Promise.resolve(resources),
        ),
    };
    const resourcesService = {
      batchGetParentResources: jest.fn().mockResolvedValue(parentById),
      getAllResources: jest.fn(),
      getAllSubResources: jest.fn(),
    };
    const scopeService = {
      getOwnerRootId: jest.fn().mockResolvedValue('private-root'),
      getScopedVisibleResourceIds: jest.fn(),
    };
    const tagService = {
      getTagsByIds: jest.fn(),
    };
    const expressionService = new SmartFolderExpressionService({
      t: jest.fn((key: string) => key),
    } as any);
    const service = new SmartFoldersService(
      smartFolderConfigRepository as any,
      resourceRepository as any,
      {} as any,
      smartFolderResourcesService as any,
      permissionsService as any,
      resourcesService as any,
      {} as any,
      scopeService as any,
      new SmartFoldersMatcherService(expressionService),
      expressionService,
      {} as any,
      tagService as any,
      { t: jest.fn((key: string) => key) } as any,
    );

    return {
      queryBuilder,
      resourceRepository,
      resourcesService,
      smartFolderResourcesService,
      scopeService,
      service,
    };
  }

  it('returns matched visible non-smart-folder resources inside the configured scope', async () => {
    const {
      queryBuilder,
      resourcesService,
      smartFolderResourcesService,
      scopeService,
      service,
    } = createService();

    const result = await service.listChildren(
      'user-id',
      'namespace-id',
      'smart-folder-id',
    );

    expect(
      smartFolderResourcesService.getUserVisibleResources,
    ).not.toHaveBeenCalled();
    expect(scopeService.getScopedVisibleResourceIds).not.toHaveBeenCalled();
    expect(resourcesService.getAllResources).not.toHaveBeenCalled();
    expect(resourcesService.getAllSubResources).not.toHaveBeenCalled();
    expect(scopeService.getOwnerRootId).toHaveBeenCalledWith(
      'user-id',
      'namespace-id',
      SmartFolderRootScope.PRIVATE,
    );
    expect(resourcesService.batchGetParentResources).toHaveBeenCalled();
    expect(queryBuilder.select).toHaveBeenCalledWith(
      expect.not.arrayContaining(['resource.content']),
    );
    expect(result.map((resource) => resource.id)).toEqual([
      'matched-doc-id',
      'rss-folder-child-id',
      'rss-item-resource-id',
    ]);
  });

  // Only other smart folders are excluded. An rss folder is collected like any
  // other container and an rss item like any other content resource.
  it('includes rss folders and the items inside them', async () => {
    const { service } = createService();

    const result = await service.listChildren(
      'user-id',
      'namespace-id',
      'smart-folder-id',
    );

    const ids = result.map((resource) => resource.id);
    expect(ids).toContain('rss-folder-child-id');
    expect(ids).toContain('rss-item-resource-id');
    expect(ids).not.toContain('smart-folder-child-id');
    expect(ids).not.toContain('out-of-scope-doc-id');
  });
});
