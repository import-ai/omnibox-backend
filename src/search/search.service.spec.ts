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
    const searchCandidateService = {
      getFilterCandidateResourceIds: jest.fn(
        async (_userId: string, _namespaceId: string, options: any) => {
          const conditions = options?.conditions || [];
          if (conditions.length <= 0) {
            return null;
          }
          const visibleResources =
            await namespaceResourcesService.getAllResourcesByUser(
              userId,
              namespaceId,
            );
          const visibleResourceIds = visibleResources.map(
            (resource) => resource.id,
          );
          const matchedResourceIds =
            await searchResourceFilterService.getMatchedResourceIds(
              namespaceId,
              visibleResourceIds,
              options,
            );
          if (!matchedResourceIds) {
            return null;
          }
          return visibleResourceIds.filter((id) => matchedResourceIds.has(id));
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
      searchCandidateService as any,
    );

    return {
      conversationsService,
      matcherService,
      namespaceResourcesService,
      permissionsService,
      resourcesService,
      ruleService,
      searchCandidateService,
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
    const {
      matcherService,
      resourcesService,
      ruleService,
      searchCandidateService,
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
    expect(
      searchCandidateService.getFilterCandidateResourceIds,
    ).toHaveBeenCalledWith(
      userId,
      namespaceId,
      expect.objectContaining({
        conditions,
        matchMode: SmartFolderMatchMode.ALL,
      }),
    );
    expect(wizardApiService.search).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceIds: [matchingResourceId],
      }),
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

  it('uses default response limit while fetching semantic pages in larger batches', async () => {
    const { service, wizardApiService } = createService();

    const result = await service.searchPaginated(
      userId,
      namespaceId,
      'query',
      undefined,
      {},
      {
        offset: 0,
      },
    );

    expect(wizardApiService.search).toHaveBeenCalledWith(
      expect.objectContaining({
        offset: 0,
        limit: 100,
      }),
    );
    expect(result.limit).toBe(20);
  });

  it('reuses semantic scan state for sequential offset pages', async () => {
    const { permissionsService, resourcesService, service, wizardApiService } =
      createService();
    const createRecords = (page: number) =>
      Array.from({ length: 100 }, (_, index) => {
        const id = `page-${page}-resource-${index}`;
        return {
          id: `page-${page}-record-${index}`,
          type: IndexRecordType.CHUNK,
          chunk: {
            resourceId: id,
            title: `Page ${page} title ${index}`,
            text: `Page ${page} content ${index}`,
          },
        };
      });

    wizardApiService.search.mockImplementation((request: any) =>
      Promise.resolve({
        records: request.offset === 0 ? createRecords(0) : createRecords(1),
      }),
    );
    permissionsService.getCurrentPermissions.mockImplementation(
      (_userId: string, _namespaceId: string, resources: any[]) =>
        Promise.resolve(
          new Map(
            resources.map((resource) => [
              resource.id,
              ResourcePermission.CAN_VIEW,
            ]),
          ),
        ),
    );
    resourcesService.batchGetParentResources.mockImplementation(
      (_namespaceId: string, ids: string[]) =>
        Promise.resolve(
          new Map(
            ids.map((id) => [
              id,
              {
                id,
                name: `Title for ${id}`,
                attrs: {},
                resourceType: ResourceType.DOC,
              },
            ]),
          ),
        ),
    );

    await service.searchPaginated(
      userId,
      namespaceId,
      'query',
      undefined,
      {},
      {
        offset: 0,
        limit: 100,
      },
    );
    const secondPage = await service.searchPaginated(
      userId,
      namespaceId,
      'query',
      undefined,
      {},
      {
        offset: 100,
        limit: 100,
      },
    );

    expect(wizardApiService.search).toHaveBeenCalledTimes(2);
    expect(wizardApiService.search).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        offset: 0,
        limit: 100,
      }),
    );
    expect(wizardApiService.search).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        offset: 100,
        limit: 100,
      }),
    );
    expect(secondPage.items[0]).toMatchObject({
      resourceId: 'page-1-resource-0',
    });
  });

  it('refreshes permissions before returning cached semantic pages', async () => {
    const { permissionsService, resourcesService, service, wizardApiService } =
      createService();
    const createRecords = () =>
      Array.from({ length: 100 }, (_, index) => {
        const id = `cached-resource-${index}`;
        return {
          id: `cached-record-${index}`,
          type: IndexRecordType.CHUNK,
          chunk: {
            resourceId: id,
            title: `Cached title ${index}`,
            text: `Cached content ${index}`,
          },
        };
      });

    wizardApiService.search.mockResolvedValue({
      records: createRecords(),
    });
    permissionsService.getCurrentPermissions
      .mockImplementationOnce(
        (_userId: string, _namespaceId: string, resources) =>
          Promise.resolve(
            new Map(
              resources.map((resource: any) => [
                resource.id,
                ResourcePermission.CAN_VIEW,
              ]),
            ),
          ),
      )
      .mockImplementationOnce(
        (_userId: string, _namespaceId: string, resources) =>
          Promise.resolve(
            new Map(
              resources
                .filter((resource: any) => resource.id !== 'cached-resource-10')
                .map((resource: any) => [
                  resource.id,
                  ResourcePermission.CAN_VIEW,
                ]),
            ),
          ),
      );
    resourcesService.batchGetParentResources.mockImplementation(
      (_namespaceId: string, ids: string[]) =>
        Promise.resolve(
          new Map(
            ids.map((id) => [
              id,
              {
                id,
                name: `Title for ${id}`,
                attrs: {},
                resourceType: ResourceType.DOC,
              },
            ]),
          ),
        ),
    );

    await service.searchPaginated(
      userId,
      namespaceId,
      'query',
      undefined,
      {},
      {
        offset: 0,
        limit: 100,
      },
    );
    const cachedPage = await service.searchPaginated(
      userId,
      namespaceId,
      'query',
      undefined,
      {},
      {
        offset: 10,
        limit: 1,
      },
    );

    expect(cachedPage.items).toEqual([]);
    expect(permissionsService.getCurrentPermissions).toHaveBeenCalledTimes(2);
  });

  it('deduplicates semantic resource results across fetched pages', async () => {
    const { permissionsService, resourcesService, service, wizardApiService } =
      createService();
    const duplicateResourceId = 'duplicate-resource-id';
    const firstPageResourceIds = Array.from(
      { length: 12 },
      (_, index) => `first-page-resource-id-${index}`,
    );
    const hiddenResourceIds = Array.from(
      { length: 87 },
      (_, index) => `hidden-resource-id-${index}`,
    );
    const secondPageResourceIds = Array.from(
      { length: 7 },
      (_, index) => `second-page-resource-id-${index}`,
    );
    const allowedResourceIds = new Set([
      duplicateResourceId,
      ...firstPageResourceIds,
      ...secondPageResourceIds,
    ]);
    const firstPageRecords = [
      {
        id: 'duplicate-result-id-1',
        type: IndexRecordType.CHUNK,
        chunk: {
          resourceId: duplicateResourceId,
          title: 'Duplicate title',
          text: 'First matching chunk',
        },
      },
      ...firstPageResourceIds.map((id, index) => ({
        id: `first-page-result-id-${index}`,
        type: IndexRecordType.CHUNK,
        chunk: {
          resourceId: id,
          title: `First page title ${index}`,
          text: `First page content ${index}`,
        },
      })),
      ...hiddenResourceIds.map((id, index) => ({
        id: `hidden-result-id-${index}`,
        type: IndexRecordType.CHUNK,
        chunk: {
          resourceId: id,
          title: `Hidden title ${index}`,
          text: `Hidden content ${index}`,
        },
      })),
    ];

    wizardApiService.search
      .mockResolvedValueOnce({
        records: firstPageRecords,
      })
      .mockResolvedValueOnce({
        records: [
          {
            id: 'duplicate-result-id-2',
            type: IndexRecordType.CHUNK,
            chunk: {
              resourceId: duplicateResourceId,
              title: 'Duplicate title',
              text: 'Second matching chunk',
            },
          },
          ...secondPageResourceIds.map((id, index) => ({
            id: `second-page-result-id-${index}`,
            type: IndexRecordType.CHUNK,
            chunk: {
              resourceId: id,
              title: `Second page title ${index}`,
              text: `Second page content ${index}`,
            },
          })),
        ],
      });
    permissionsService.getCurrentPermissions.mockImplementation(
      (_userId: string, _namespaceId: string, resources: any[]) =>
        Promise.resolve(
          new Map(
            resources
              .filter((resource) => allowedResourceIds.has(resource.id))
              .map((resource) => [resource.id, ResourcePermission.CAN_VIEW]),
          ),
        ),
    );
    resourcesService.batchGetParentResources.mockImplementation(
      (_namespaceId: string, ids: string[]) =>
        Promise.resolve(
          new Map(
            ids.map((id) => [
              id,
              {
                id,
                name:
                  id === duplicateResourceId
                    ? 'Duplicate title'
                    : `Title for ${id}`,
                attrs: {},
                resourceType: ResourceType.DOC,
              },
            ]),
          ),
        ),
    );

    const result = await service.searchPaginated(
      userId,
      namespaceId,
      'query',
      undefined,
      {},
      {
        offset: 0,
        limit: 20,
      },
    );

    expect(result.items.map((item: any) => item.resourceId)).toEqual([
      duplicateResourceId,
      ...firstPageResourceIds,
      ...secondPageResourceIds,
    ]);
    expect(result.total).toBe(20);
  });

  it('continues semantic search pages until the requested filtered page is filled', async () => {
    const {
      matcherService,
      namespaceResourcesService,
      permissionsService,
      resourcesService,
      service,
      wizardApiService,
    } = createService();
    const laterMatchingResourceId = 'later-matching-resource-id';
    namespaceResourcesService.getAllResourcesByUser.mockResolvedValueOnce([
      {
        id: laterMatchingResourceId,
        parentId: 'parent-id',
      },
      {
        id: resourceId,
        parentId: 'parent-id',
      },
    ]);
    matcherService.matches.mockImplementation(
      (resource) => resource.id === laterMatchingResourceId,
    );
    const conditions = [
      {
        field: SmartFolderField.TITLE,
        operator: SmartFolderOperator.CONTAINS,
        value: 'matched',
      },
    ];
    const nonMatchingRecords = Array.from({ length: 100 }, (_, index) => ({
      id: `non-matching-result-id-${index}`,
      type: IndexRecordType.CHUNK,
      chunk: {
        resourceId: `non-matching-resource-id-${index}`,
        title: `Query resource title ${index}`,
        text: `Query resource content ${index}`,
      },
    }));
    wizardApiService.search
      .mockResolvedValueOnce({
        records: nonMatchingRecords,
      })
      .mockResolvedValueOnce({
        records: [
          {
            id: 'later-matching-resource-result-id',
            type: IndexRecordType.CHUNK,
            chunk: {
              resourceId: laterMatchingResourceId,
              title: 'Later matched title',
              text: 'Later matched content',
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        records: [],
      });
    permissionsService.getCurrentPermissions.mockImplementation(
      (_userId: string, _namespaceId: string, resources: any[]) =>
        Promise.resolve(
          new Map(
            resources.map((resource) => [
              resource.id,
              ResourcePermission.CAN_VIEW,
            ]),
          ),
        ),
    );
    resourcesService.batchGetParentResources.mockImplementation(
      (_namespaceId: string, ids: string[]) =>
        Promise.resolve(
          new Map(
            ids.map((id) => [
              id,
              {
                id,
                name:
                  id === laterMatchingResourceId
                    ? 'Later matched title'
                    : 'Query resource title',
                attrs: {},
                resourceType: ResourceType.DOC,
              },
            ]),
          ),
        ),
    );
    resourcesService.batchGetResources.mockImplementation(
      (_namespaceId: string, ids: string[]) =>
        Promise.resolve(
          ids.map((id) => ({
            id,
            name:
              id === laterMatchingResourceId
                ? 'Later matched title'
                : 'Query resource title',
            attrs: {},
            resourceType: ResourceType.DOC,
            tagIds: [],
            createdAt: new Date('2026-05-01T00:00:00.000Z'),
            updatedAt: new Date('2026-05-01T00:00:00.000Z'),
            content:
              id === laterMatchingResourceId
                ? 'Later matched content'
                : 'Query resource content',
          })),
        ),
    );

    const result = await service.searchPaginated(
      userId,
      namespaceId,
      'query',
      undefined,
      {
        conditions,
        matchMode: SmartFolderMatchMode.ALL,
      },
      {
        offset: 0,
        limit: 1,
      },
    );

    expect(wizardApiService.search).toHaveBeenCalledTimes(2);
    expect(wizardApiService.search).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        offset: 0,
        limit: 100,
        resourceIds: [laterMatchingResourceId],
      }),
    );
    expect(wizardApiService.search).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        offset: 100,
        limit: 100,
        resourceIds: [laterMatchingResourceId],
      }),
    );
    expect(result).toEqual({
      items: [
        expect.objectContaining({
          type: DocType.RESOURCE,
          resourceId: laterMatchingResourceId,
        }),
      ],
      total: 1,
      offset: 0,
      limit: 1,
    });
  });

  it('does not widen semantic results when filter match mode is any', async () => {
    const {
      searchCandidateService,
      searchResourceFilterService,
      service,
      wizardApiService,
    } = createService();
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
      searchCandidateService.getFilterCandidateResourceIds,
    ).toHaveBeenCalledWith(
      userId,
      namespaceId,
      expect.objectContaining({
        conditions,
        matchMode: SmartFolderMatchMode.ANY,
      }),
    );
    expect(wizardApiService.search).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceIds: [matchingResourceId],
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
