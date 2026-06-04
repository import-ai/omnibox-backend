import { DocType } from './doc-type.enum';
import { SearchService } from './search.service';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { IndexRecordType } from 'omniboxd/wizard/dto/index-record.dto';
import {
  SmartFolderField,
  SmartFolderMatchMode,
  SmartFolderOperator,
} from 'omniboxd/smart-folders/entities/smart-folder-config.entity';

describe('SearchService', () => {
  const namespaceId = 'namespace-id';
  const userId = 'user-id';
  const resourceId = 'resource-id';
  const matchingResourceId = 'matching-resource-id';
  const conversationId = 'conversation-id';

  function createService() {
    const wizardApiService = {
      search: jest.fn().mockResolvedValue({
        records: [
          {
            id: 'resource-result-id',
            type: IndexRecordType.CHUNK,
            chunk: {
              resourceId,
              title: 'Query resource title',
              text: 'Query resource content',
            },
          },
          {
            id: 'matching-resource-result-id',
            type: IndexRecordType.CHUNK,
            chunk: {
              resourceId: matchingResourceId,
              title: 'Query matched title',
              text: 'Query matched content',
            },
          },
          {
            id: 'message-result-id',
            type: IndexRecordType.MESSAGE,
            message: {
              conversationId,
              message: {
                content: 'Message content',
              },
            },
          },
        ],
      }),
    };
    const permissionsService = {
      userInNamespace: jest.fn().mockResolvedValue(true),
      getCurrentPermissions: jest.fn().mockResolvedValue(
        new Map([
          [resourceId, ResourcePermission.CAN_VIEW],
          [matchingResourceId, ResourcePermission.CAN_VIEW],
        ]),
      ),
    };
    const resourcesService = {
      batchGetParentResources: jest.fn().mockResolvedValue(
        new Map([
          [
            resourceId,
            {
              id: resourceId,
              name: 'Query resource title',
              attrs: {},
              resourceType: ResourceType.DOC,
            },
          ],
          [
            matchingResourceId,
            {
              id: matchingResourceId,
              name: 'Query matched title',
              attrs: {},
              resourceType: ResourceType.DOC,
            },
          ],
        ]),
      ),
      batchGetResources: jest.fn().mockResolvedValue([
        {
          id: resourceId,
          name: 'Query resource title',
          attrs: {},
          resourceType: ResourceType.DOC,
          tagIds: [],
          createdAt: new Date('2026-05-01T00:00:00.000Z'),
          updatedAt: new Date('2026-05-01T00:00:00.000Z'),
          content: 'Query resource content',
        },
        {
          id: matchingResourceId,
          name: 'Query matched title',
          attrs: {},
          resourceType: ResourceType.DOC,
          tagIds: [],
          createdAt: new Date('2026-05-02T00:00:00.000Z'),
          updatedAt: new Date('2026-05-02T00:00:00.000Z'),
          content: 'Query matched content',
        },
      ]),
    };
    const namespaceResourcesService = {
      getAllResourcesByUser: jest.fn().mockResolvedValue([
        {
          id: resourceId,
          parentId: 'parent-id',
        },
        {
          id: matchingResourceId,
          parentId: 'parent-id',
        },
      ]),
    };
    const conversationsService = {
      has: jest.fn().mockResolvedValue(true),
    };
    const ruleService = {
      normalize: jest.fn((conditions) => conditions),
    };
    const matcherService = {
      matches: jest.fn<any, any[]>(
        (resource) => resource.id === matchingResourceId,
      ),
    };
    const searchResourceFilterService = {
      normalizeOptions: jest.fn((options) => ({
        ...options,
        conditions: ruleService.normalize(options?.conditions || []),
      })),
      getMatchedResourceIds: jest.fn(
        async (_namespaceId: string, ids: string[], options: any) => {
          const conditions = options?.conditions || [];
          if (conditions.length <= 0) {
            return null;
          }
          const resources = await resourcesService.batchGetResources(
            namespaceId,
            ids,
          );
          return new Set(
            resources
              .filter((resource) =>
                matcherService.matches(
                  resource,
                  conditions,
                  options?.matchMode ?? SmartFolderMatchMode.ALL,
                ),
              )
              .map((resource) => resource.id),
          );
        },
      ),
      searchResourcesByFilters: jest.fn(
        async (_userId: string, _namespaceId: string, options: any) => {
          const visibleResources =
            await namespaceResourcesService.getAllResourcesByUser(
              userId,
              namespaceId,
            );
          const resources = await resourcesService.batchGetResources(
            namespaceId,
            visibleResources.map((resource) => resource.id),
          );
          return resources
            .filter((resource) =>
              matcherService.matches(
                resource,
                options.conditions || [],
                options.matchMode ?? SmartFolderMatchMode.ALL,
              ),
            )
            .map((resource) => ({
              type: DocType.RESOURCE,
              id: resource.id,
              resourceId: resource.id,
              title: resource.name,
              content: resource.content || '',
              attrs: resource.attrs || {},
              resourceType: resource.resourceType,
            }));
        },
      ),
      searchResourcesByFiltersWithTotal: jest.fn(
        async (_userId: string, _namespaceId: string, options: any) => {
          const visibleResources =
            await namespaceResourcesService.getAllResourcesByUser(
              userId,
              namespaceId,
            );
          const resources = await resourcesService.batchGetResources(
            namespaceId,
            visibleResources.map((resource) => resource.id),
          );
          const items = resources
            .filter((resource) =>
              matcherService.matches(
                resource,
                options.conditions || [],
                options.matchMode ?? SmartFolderMatchMode.ALL,
              ),
            )
            .map((resource) => ({
              type: DocType.RESOURCE,
              id: resource.id,
              resourceId: resource.id,
              title: resource.name,
              content: resource.content || '',
              attrs: resource.attrs || {},
              resourceType: resource.resourceType,
            }));

          return {
            items,
            total: items.length,
          };
        },
      ),
    };
    const service = new SearchService(
      wizardApiService as any,
      permissionsService as any,
      namespaceResourcesService as any,
      resourcesService as any,
      {} as any,
      conversationsService as any,
      {} as any,
      {} as any,
      {
        t: jest.fn().mockReturnValue('Not authorized'),
      } as any,
      {} as any,
      searchResourceFilterService as any,
    );

    return {
      conversationsService,
      matcherService,
      namespaceResourcesService,
      permissionsService,
      resourcesService,
      ruleService,
      searchResourceFilterService,
      service,
      wizardApiService,
    };
  }

  it('searches resources only by default', async () => {
    const { conversationsService, service, wizardApiService } = createService();

    const result = await service.search(userId, namespaceId, 'query');

    expect(wizardApiService.search).toHaveBeenCalledWith(
      expect.objectContaining({
        type: IndexRecordType.CHUNK,
      }),
    );
    expect(result).toHaveLength(2);
    result.forEach((item) => {
      expect(item).toMatchObject({
        type: DocType.RESOURCE,
      });
    });
    expect(conversationsService.has).not.toHaveBeenCalled();
  });

  it('filters visible resources without semantic search when query is empty', async () => {
    const {
      namespaceResourcesService,
      resourcesService,
      service,
      wizardApiService,
    } = createService();
    const conditions = [
      {
        field: SmartFolderField.TITLE,
        operator: SmartFolderOperator.CONTAINS,
        value: 'matched',
      },
    ];

    const result = await service.search(userId, namespaceId, '', undefined, {
      conditions,
      matchMode: SmartFolderMatchMode.ALL,
    });

    expect(wizardApiService.search).not.toHaveBeenCalled();
    expect(
      namespaceResourcesService.getAllResourcesByUser,
    ).toHaveBeenCalledWith(userId, namespaceId);
    expect(resourcesService.batchGetResources).toHaveBeenCalledWith(
      namespaceId,
      [resourceId, matchingResourceId],
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: DocType.RESOURCE,
      resourceId: matchingResourceId,
    });
  });

  it('returns paginated filter results for post search', async () => {
    const { matcherService, service } = createService();
    matcherService.matches.mockReturnValue(true);
    const conditions = [
      {
        field: SmartFolderField.TITLE,
        operator: SmartFolderOperator.CONTAINS,
        value: 'matched',
      },
    ];

    const result = await service.searchPaginated(
      userId,
      namespaceId,
      '',
      undefined,
      {
        conditions,
        matchMode: SmartFolderMatchMode.ALL,
      },
      {
        offset: 1,
        limit: 1,
      },
    );

    expect(result).toEqual({
      items: [
        expect.objectContaining({
          type: DocType.RESOURCE,
          resourceId: matchingResourceId,
        }),
      ],
      total: 2,
      offset: 1,
      limit: 1,
    });
  });

  it('returns empty results without semantic search when query and filters are empty', async () => {
    const { searchResourceFilterService, service, wizardApiService } =
      createService();

    const result = await service.search(userId, namespaceId, '', undefined, {});

    expect(wizardApiService.search).not.toHaveBeenCalled();
    expect(
      searchResourceFilterService.searchResourcesByFilters,
    ).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it('returns empty results without semantic search when query contains only whitespace', async () => {
    const { searchResourceFilterService, service, wizardApiService } =
      createService();

    const result = await service.search(
      userId,
      namespaceId,
      '   ',
      undefined,
      {},
    );

    expect(wizardApiService.search).not.toHaveBeenCalled();
    expect(
      searchResourceFilterService.searchResourcesByFilters,
    ).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it('filters semantic resource results with smart folder conditions', async () => {
    const { matcherService, resourcesService, ruleService, service } =
      createService();
    const conditions = [
      {
        field: SmartFolderField.TITLE,
        operator: SmartFolderOperator.CONTAINS,
        value: 'matched',
      },
    ];

    const result = await service.search(
      userId,
      namespaceId,
      'query',
      undefined,
      {
        conditions,
        matchMode: SmartFolderMatchMode.ALL,
      },
    );

    expect(ruleService.normalize).toHaveBeenCalledWith(conditions);
    expect(resourcesService.batchGetResources).toHaveBeenCalledWith(
      namespaceId,
      [resourceId, matchingResourceId],
    );
    expect(matcherService.matches).toHaveBeenCalledWith(
      expect.objectContaining({ id: resourceId }),
      conditions,
      SmartFolderMatchMode.ALL,
    );
    expect(matcherService.matches).toHaveBeenCalledWith(
      expect.objectContaining({ id: matchingResourceId }),
      conditions,
      SmartFolderMatchMode.ALL,
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: DocType.RESOURCE,
      resourceId: matchingResourceId,
    });
  });

  it('keeps semantic resource results without literal query matches', async () => {
    const { resourcesService, service, wizardApiService } = createService();
    wizardApiService.search.mockResolvedValueOnce({
      records: [
        {
          id: 'related-resource-result-id',
          type: IndexRecordType.CHUNK,
          chunk: {
            resourceId,
            title: 'Related city notes',
            text: 'City travel content',
          },
        },
        {
          id: 'shanghai-resource-result-id',
          type: IndexRecordType.CHUNK,
          chunk: {
            resourceId: matchingResourceId,
            title: '上海项目记录',
            text: '了解客户安排',
          },
        },
      ],
    });
    resourcesService.batchGetResources.mockResolvedValueOnce([
      {
        id: resourceId,
        name: 'Related city notes',
        attrs: {},
        resourceType: ResourceType.DOC,
        tagIds: [],
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
        updatedAt: new Date('2026-05-01T00:00:00.000Z'),
        content: 'City travel content',
      },
      {
        id: matchingResourceId,
        name: '上海项目记录',
        attrs: {},
        resourceType: ResourceType.DOC,
        tagIds: [],
        createdAt: new Date('2026-05-02T00:00:00.000Z'),
        updatedAt: new Date('2026-05-02T00:00:00.000Z'),
        content: '了解客户安排',
      },
    ]);

    const result = await service.search(userId, namespaceId, '上海');

    expect(result).toHaveLength(2);
    expect(result).toEqual([
      expect.objectContaining({
        type: DocType.RESOURCE,
        resourceId,
      }),
      expect.objectContaining({
        type: DocType.RESOURCE,
        resourceId: matchingResourceId,
      }),
    ]);
  });

  it('returns paginated semantic results for post search', async () => {
    const { service } = createService();

    const result = await service.searchPaginated(
      userId,
      namespaceId,
      'query',
      undefined,
      {},
      {
        offset: 1,
        limit: 1,
      },
    );

    expect(result).toEqual({
      items: [
        expect.objectContaining({
          type: DocType.RESOURCE,
          resourceId: matchingResourceId,
        }),
      ],
      total: 2,
      offset: 1,
      limit: 1,
    });
  });

  it('does not widen semantic results when filter match mode is any', async () => {
    const { searchResourceFilterService, service, wizardApiService } =
      createService();
    wizardApiService.search.mockResolvedValueOnce({
      records: [
        {
          id: 'resource-result-id',
          type: IndexRecordType.CHUNK,
          chunk: {
            resourceId,
            title: 'Keyword result',
            text: 'Keyword content',
          },
        },
      ],
    });
    const conditions = [
      {
        field: SmartFolderField.TITLE,
        operator: SmartFolderOperator.CONTAINS,
        value: 'matched',
      },
      {
        field: SmartFolderField.TAGS,
        operator: SmartFolderOperator.CONTAINS,
        value: 'roadmap',
      },
    ];

    const result = await service.search(
      userId,
      namespaceId,
      'keyword',
      undefined,
      {
        conditions,
        matchMode: SmartFolderMatchMode.ANY,
      },
    );

    expect(
      searchResourceFilterService.searchResourcesByFilters,
    ).not.toHaveBeenCalled();
    expect(
      searchResourceFilterService.getMatchedResourceIds,
    ).toHaveBeenCalledWith(
      namespaceId,
      [resourceId],
      expect.objectContaining({
        conditions,
        matchMode: SmartFolderMatchMode.ANY,
      }),
    );
    expect(result).toEqual([]);
  });

  it('returns no conversations when message type is requested', async () => {
    const { service, wizardApiService } = createService();

    const result = await service.search(
      userId,
      namespaceId,
      'query',
      DocType.MESSAGE,
    );

    expect(wizardApiService.search).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it('rejects users outside the namespace', async () => {
    const { permissionsService, service } = createService();
    permissionsService.userInNamespace.mockResolvedValue(false);

    await expect(
      service.search(userId, namespaceId, 'query'),
    ).rejects.toMatchObject({
      code: 'NOT_AUTHORIZED',
    });
  });

  it('rejects users outside the namespace before handling message searches', async () => {
    const { permissionsService, service } = createService();
    permissionsService.userInNamespace.mockResolvedValue(false);

    await expect(
      service.search(userId, namespaceId, 'query', DocType.MESSAGE),
    ).rejects.toMatchObject({
      code: 'NOT_AUTHORIZED',
    });
  });
});
