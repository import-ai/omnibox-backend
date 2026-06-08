import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import {
  SmartFolderField,
  SmartFolderMatchMode,
  SmartFolderOperator,
  SmartFolderRootScope,
} from 'omniboxd/smart-folders/entities/smart-folder-config.entity';
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
    ];
    const resourceRepository = {
      find: jest.fn(({ where }) => {
        const ids = new Set<string>(where.id.value);
        return Promise.resolve(
          resources.filter((resource) => ids.has(resource.id)),
        );
      }),
    };
    const namespaceResourcesService = {
      getUserVisibleResources: jest.fn().mockResolvedValue(resources),
    };
    const permissionsService = {
      userHasPermission: jest.fn().mockResolvedValue(true),
    };
    const scopeService = {
      getScopedVisibleResourceIds: jest
        .fn()
        .mockResolvedValue(
          new Set(['matched-doc-id', 'smart-folder-child-id']),
        ),
    };
    const tagService = {
      getTagsByIds: jest.fn(),
    };
    const service = new SmartFoldersService(
      smartFolderConfigRepository as any,
      resourceRepository as any,
      {} as any,
      namespaceResourcesService as any,
      permissionsService as any,
      {} as any,
      scopeService as any,
      new SmartFoldersMatcherService(),
      {} as any,
      tagService as any,
      { t: jest.fn((key: string) => key) } as any,
    );

    return { resourceRepository, scopeService, service };
  }

  it('returns matched visible non-smart-folder resources inside the configured scope', async () => {
    const { resourceRepository, scopeService, service } = createService();

    const result = await service.listChildren(
      'user-id',
      'namespace-id',
      'smart-folder-id',
    );

    expect(scopeService.getScopedVisibleResourceIds).toHaveBeenCalledWith(
      'user-id',
      'namespace-id',
      SmartFolderRootScope.PRIVATE,
      expect.any(Array),
    );
    expect(resourceRepository.find).toHaveBeenCalledWith({
      where: {
        namespaceId: 'namespace-id',
        id: expect.any(Object),
      },
    });
    expect(result.map((resource) => resource.id)).toEqual(['matched-doc-id']);
  });
});
