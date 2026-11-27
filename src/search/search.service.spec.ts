import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import {
  SmartFolderField,
  SmartFolderMatchMode,
  SmartFolderOperator,
} from 'omniboxd/smart-folders/entities/smart-folder-config.entity';
import { IndexRecordType } from 'omniboxd/wizard/dto/index-record.dto';

import { DocType } from './doc-type.enum';
import { SearchService } from './search.service';

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
      get: jest.fn().mockResolvedValue({
        id: conversationId,
        namespaceId,
        userId,
        title: 'Conversation title',
      }),
    };
    const messagesService = {
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockImplementation((id: string) => {
        const messages: Record<string, any> = {
          'message-one': {
            id,
            conversationId,
            userId,
            message: { role: 'user', content: 'Matched message' },
          },
          'message-two': {
            id,
            conversationId,
            userId,
            status: 'success',
            attrs: {},
            message: { role: 'assistant', content: 'Another matched message' },
          },
          'message-pagination-one': {
            id,
            conversationId: 'conversation-one',
            userId,
            message: { role: 'user', content: 'Matched one' },
          },
          'message-pagination-two': {
            id,
            conversationId: 'conversation-two',
            userId,
            message: { role: 'user', content: 'Matched two' },
          },
          'semantic-only-result': {
            id,
            conversationId,
            userId,
            message: {
              role: 'assistant',
              content: 'Related but not an exact match',
            },
          },
          'tool-message': {
            id,
            conversationId,
            userId,
            message: { role: 'tool', content: 'Matched tool output' },
          },
        };
        const message = messages[id];
        if (!message) throw new Error('message not found');
        return message;
      }),
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
        async (
          _userId: string,
          _namespaceId: string,
          options: any,
          pagination?: { offset: number; limit: number },
        ) => {
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

          // The real service collapses duplicate articles before it cuts the
          // page, so the page comes back already sliced.
          return {
            items: pagination
              ? items.slice(
                  pagination.offset,
                  pagination.offset + pagination.limit,
                )
              : items,
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
      messagesService as any,
      conversationsService as any,
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
      messagesService,
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
    expect(conversationsService.get).not.toHaveBeenCalled();
  });

  it('returns every authorized message result without conversation deduplication', async () => {
    const { conversationsService, service, wizardApiService } = createService();
    wizardApiService.search.mockResolvedValue({
      records: [
        {
          id: 'message-result-id',
          type: IndexRecordType.MESSAGE,
          message: {
            conversationId,
            messageId: 'message-one',
            message: { role: 'user', content: 'Matched message' },
          },
        },
        {
          id: 'duplicate-message-result-id',
          type: IndexRecordType.MESSAGE,
          message: {
            conversationId,
            messageId: 'message-two',
            message: {
              role: 'assistant',
              content: 'Another matched message',
            },
          },
        },
      ],
    });

    const result = await service.search(
      userId,
      namespaceId,
      'matched',
      DocType.MESSAGE,
    );

    expect(wizardApiService.search).toHaveBeenCalledWith(
      expect.objectContaining({
        type: IndexRecordType.MESSAGE,
        userId,
        namespaceId,
      }),
    );
    expect(conversationsService.get).toHaveBeenCalledTimes(1);
    expect(conversationsService.get).toHaveBeenCalledWith(conversationId);
    expect(result).toEqual([
      {
        type: DocType.MESSAGE,
        id: 'message-one',
        messageId: 'message-one',
        conversationId,
        title: 'Conversation title',
        role: 'user',
        content: 'Matched message',
      },
      {
        type: DocType.MESSAGE,
        id: 'message-two',
        messageId: 'message-two',
        conversationId,
        title: 'Conversation title',
        role: 'assistant',
        content: 'Another matched message',
      },
    ]);
  });

  it('drops message results outside the current user namespace', async () => {
    const { conversationsService, service } = createService();
    conversationsService.get.mockResolvedValue({
      id: conversationId,
      namespaceId,
      userId: 'another-user',
      title: 'Private conversation',
    });

    const result = await service.search(
      userId,
      namespaceId,
      'query',
      DocType.MESSAGE,
    );

    expect(result).toEqual([]);
  });

  it('paginates message results', async () => {
    const { conversationsService, service, wizardApiService } = createService();
    wizardApiService.search.mockResolvedValue({
      records: ['one', 'two'].map((suffix) => ({
        id: `message-pagination-${suffix}`,
        type: IndexRecordType.MESSAGE,
        message: {
          conversationId: `conversation-${suffix}`,
          messageId: `message-pagination-${suffix}`,
          message: { role: 'user', content: `Matched ${suffix}` },
        },
      })),
    });
    conversationsService.get.mockImplementation((id: string) =>
      Promise.resolve({
        id,
        namespaceId,
        userId,
        title: id,
      }),
    );

    const result = await service.searchPaginated(
      userId,
      namespaceId,
      'matched',
      DocType.MESSAGE,
      undefined,
      { offset: 1, limit: 1 },
    );

    expect(result).toMatchObject({
      total: 2,
      offset: 1,
      limit: 1,
      items: [expect.objectContaining({ conversationId: 'conversation-two' })],
    });
  });

  it('drops semantic message results that do not contain every keyword', async () => {
    const { conversationsService, service, wizardApiService } = createService();
    wizardApiService.search.mockResolvedValue({
      records: [
        {
          id: 'semantic-only-result',
          type: IndexRecordType.MESSAGE,
          message: {
            conversationId,
            messageId: 'semantic-only-result',
            message: {
              role: 'assistant',
              content: 'Related but not an exact match',
            },
          },
        },
      ],
    });

    const result = await service.search(
      userId,
      namespaceId,
      'missing keyword',
      DocType.MESSAGE,
    );

    expect(result).toEqual([]);
    expect(conversationsService.get).not.toHaveBeenCalled();
  });

  it('drops message records without a message id or displayable role', async () => {
    const { conversationsService, service, wizardApiService } = createService();
    wizardApiService.search.mockResolvedValue({
      records: [
        {
          type: IndexRecordType.MESSAGE,
          message: {
            conversationId,
            message: { role: 'user', content: 'Matched message' },
          },
        },
        {
          id: 'tool-message',
          type: IndexRecordType.MESSAGE,
          message: {
            conversationId,
            messageId: 'tool-message',
            message: { role: 'tool', content: 'Matched tool output' },
          },
        },
      ],
    });

    const result = await service.search(
      userId,
      namespaceId,
      'matched',
      DocType.MESSAGE,
    );

    expect(result).toEqual([]);
    expect(conversationsService.get).not.toHaveBeenCalled();
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

  it('fetches one fixed-depth recall page for a cache miss', async () => {
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

    expect(wizardApiService.search).toHaveBeenCalledTimes(1);
    expect(wizardApiService.search).toHaveBeenCalledWith(
      expect.objectContaining({
        offset: 0,
        limit: 200,
      }),
    );
    expect(result.limit).toBe(20);
  });

  it('fetches the fixed-depth recall page even when the requested offset is deep', async () => {
    const { permissionsService, resourcesService, service, wizardApiService } =
      createService();
    const records = Array.from({ length: 200 }, (_, index) => ({
      id: `deep-record-${index}`,
      type: IndexRecordType.CHUNK,
      chunk: {
        resourceId: `deep-resource-${index}`,
        title: `Deep title ${index}`,
        text: `Deep content ${index}`,
      },
    }));

    wizardApiService.search.mockResolvedValue({ records });
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

    const result = await service.searchPaginated(
      userId,
      namespaceId,
      'query',
      undefined,
      {},
      {
        offset: 120,
        limit: 20,
      },
    );

    expect(wizardApiService.search).toHaveBeenCalledTimes(1);
    expect(wizardApiService.search).toHaveBeenCalledWith(
      expect.objectContaining({
        offset: 0,
        limit: 200,
      }),
    );
    expect(result.items).toHaveLength(20);
    expect(result.items[0]).toMatchObject({
      resourceId: 'deep-resource-120',
    });
    expect(result.items[19]).toMatchObject({
      resourceId: 'deep-resource-139',
    });
    expect(result.total).toBe(200);
  });

  it('counts only visible resources from the fixed-depth list', async () => {
    const { permissionsService, resourcesService, service, wizardApiService } =
      createService();
    const visibleResourceIds = Array.from(
      { length: 20 },
      (_, index) => `visible-page-resource-${index}`,
    );
    const hiddenResourceIds = Array.from(
      { length: 80 },
      (_, index) => `hidden-page-resource-${index}`,
    );
    const allowedResourceIds = new Set(visibleResourceIds);

    wizardApiService.search.mockResolvedValue({
      records: [...visibleResourceIds, ...hiddenResourceIds].map((id) => ({
        id: `record-${id}`,
        type: IndexRecordType.CHUNK,
        chunk: {
          resourceId: id,
          title: `Title for ${id}`,
          text: `Content for ${id}`,
        },
      })),
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
                name: `Title for ${id}`,
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

    expect(result.items).toHaveLength(20);
    expect(result.total).toBe(20);
    expect(wizardApiService.search).toHaveBeenCalledTimes(1);
  });

  it('slices sequential offset pages from one fixed-depth list', async () => {
    const { permissionsService, resourcesService, service, wizardApiService } =
      createService();
    const records = Array.from({ length: 200 }, (_, index) => ({
      id: `page-record-${index}`,
      type: IndexRecordType.CHUNK,
      chunk: {
        resourceId: `page-resource-${index}`,
        title: `Page title ${index}`,
        text: `Page content ${index}`,
      },
    }));

    wizardApiService.search.mockResolvedValue({ records });
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

    const firstPage = await service.searchPaginated(
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
    const secondPage = await service.searchPaginated(
      userId,
      namespaceId,
      'query',
      undefined,
      {},
      {
        offset: 20,
        limit: 20,
      },
    );

    expect(wizardApiService.search).toHaveBeenCalledTimes(1);
    expect(wizardApiService.search).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        offset: 0,
        limit: 200,
      }),
    );
    expect(firstPage.total).toBe(200);
    expect(secondPage.total).toBe(200);
    expect(firstPage.items.map((item: any) => item.resourceId)).toEqual(
      Array.from({ length: 20 }, (_, index) => `page-resource-${index}`),
    );
    expect(secondPage.items.map((item: any) => item.resourceId)).toEqual(
      Array.from({ length: 20 }, (_, index) => `page-resource-${index + 20}`),
    );
  });

  it('returns an empty page beyond the fixed-depth list with the exact total', async () => {
    const { permissionsService, resourcesService, service, wizardApiService } =
      createService();
    const records = Array.from({ length: 200 }, (_, index) => ({
      id: `beyond-record-${index}`,
      type: IndexRecordType.CHUNK,
      chunk: {
        resourceId: `beyond-resource-${index}`,
        title: `Beyond title ${index}`,
        text: `Beyond content ${index}`,
      },
    }));

    wizardApiService.search.mockResolvedValue({ records });
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

    const result = await service.searchPaginated(
      userId,
      namespaceId,
      'query',
      undefined,
      {},
      {
        offset: 200,
        limit: 20,
      },
    );

    expect(wizardApiService.search).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      items: [],
      total: 200,
      offset: 200,
      limit: 20,
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
        limit: 20,
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

  it('retries a partial fixed-depth page and does not cache a still-partial page', async () => {
    const { service, wizardApiService } = createService();
    const records = [
      {
        id: 'partial-record-one',
        type: IndexRecordType.CHUNK,
        chunk: {
          resourceId,
          title: 'Partial title one',
          text: 'Partial content one',
        },
      },
      {
        id: 'partial-record-two',
        type: IndexRecordType.CHUNK,
        chunk: {
          resourceId: matchingResourceId,
          title: 'Partial title two',
          text: 'Partial content two',
        },
      },
    ];
    wizardApiService.search.mockResolvedValue({ records, partial: true });

    const firstPage = await service.searchPaginated(
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

    expect(wizardApiService.search).toHaveBeenCalledTimes(2);
    expect(firstPage).toEqual({
      items: [expect.objectContaining({ resourceId: matchingResourceId })],
      total: 2,
      offset: 1,
      limit: 1,
    });

    const secondPage = await service.searchPaginated(
      userId,
      namespaceId,
      'query',
      undefined,
      {},
      {
        offset: 0,
        limit: 1,
      },
    );

    expect(wizardApiService.search).toHaveBeenCalledTimes(4);
    expect(secondPage.items).toEqual([expect.objectContaining({ resourceId })]);
  });

  it('caches a partial fixed-depth page that becomes complete on retry', async () => {
    const { service, wizardApiService } = createService();
    const records = [
      {
        id: 'retried-record-one',
        type: IndexRecordType.CHUNK,
        chunk: {
          resourceId,
          title: 'Retried title one',
          text: 'Retried content one',
        },
      },
      {
        id: 'retried-record-two',
        type: IndexRecordType.CHUNK,
        chunk: {
          resourceId: matchingResourceId,
          title: 'Retried title two',
          text: 'Retried content two',
        },
      },
    ];
    wizardApiService.search
      .mockResolvedValueOnce({ records, partial: true })
      .mockResolvedValueOnce({ records, partial: false });

    const firstPage = await service.searchPaginated(
      userId,
      namespaceId,
      'query',
      undefined,
      {},
      {
        offset: 0,
        limit: 1,
      },
    );

    expect(wizardApiService.search).toHaveBeenCalledTimes(2);
    expect(firstPage.items).toEqual([expect.objectContaining({ resourceId })]);
    expect(firstPage.total).toBe(2);

    const secondPage = await service.searchPaginated(
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

    expect(wizardApiService.search).toHaveBeenCalledTimes(2);
    expect(secondPage.items).toEqual([
      expect.objectContaining({ resourceId: matchingResourceId }),
    ]);
    expect(secondPage.total).toBe(2);
  });

  it('deduplicates semantic resource results within the fixed-depth list', async () => {
    const { permissionsService, resourcesService, service, wizardApiService } =
      createService();
    const duplicateResourceId = 'duplicate-resource-id';
    const uniqueResourceId = 'unique-resource-id';
    const allowedResourceIds = new Set([duplicateResourceId, uniqueResourceId]);

    wizardApiService.search.mockResolvedValue({
      records: [
        {
          id: 'duplicate-result-id-1',
          type: IndexRecordType.CHUNK,
          chunk: {
            resourceId: duplicateResourceId,
            title: 'Duplicate title',
            text: 'First matching chunk',
          },
        },
        {
          id: 'duplicate-result-id-2',
          type: IndexRecordType.CHUNK,
          chunk: {
            resourceId: duplicateResourceId,
            title: 'Duplicate title',
            text: 'Second matching chunk',
          },
        },
        {
          id: 'unique-result-id',
          type: IndexRecordType.CHUNK,
          chunk: {
            resourceId: uniqueResourceId,
            title: 'Unique title',
            text: 'Unique content',
          },
        },
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
      uniqueResourceId,
    ]);
    expect(result.total).toBe(2);
    expect(wizardApiService.search).toHaveBeenCalledTimes(1);
  });

  it('does not fetch beyond the fixed-depth list to fill a filtered page', async () => {
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
    const nonMatchingRecords = Array.from({ length: 200 }, (_, index) => ({
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

    expect(wizardApiService.search).toHaveBeenCalledTimes(1);
    expect(wizardApiService.search).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        offset: 0,
        limit: 200,
        resourceIds: [laterMatchingResourceId],
      }),
    );
    expect(result).toEqual({
      items: [],
      total: 0,
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

  it('returns no conversations when the message index has no matching records', async () => {
    const { service, wizardApiService } = createService();
    wizardApiService.search.mockResolvedValue({ records: [] });

    const result = await service.search(
      userId,
      namespaceId,
      'query',
      DocType.MESSAGE,
    );

    expect(wizardApiService.search).toHaveBeenCalledWith(
      expect.objectContaining({ type: IndexRecordType.MESSAGE }),
    );
    expect(result).toEqual([]);
  });

  // Three folders on one feed hold three copies of every article, written
  // milliseconds apart, so the wizard hands them back adjacently and a reader
  // saw results 1-2-3 as the same headline three times.
  function rssItemCopyRecords(
    guid: string,
    copies: Array<{ id: string; linkId: string }>,
  ) {
    return copies.map((copy) => ({
      id: `record-${copy.id}`,
      type: IndexRecordType.CHUNK,
      chunk: {
        resourceId: copy.id,
        title: 'A shared article',
        text: 'A shared article body',
      },
      linkId: copy.linkId,
      guid,
    }));
  }

  function mockRssItemSemanticSearch(
    {
      permissionsService,
      resourcesService,
      wizardApiService,
    }: ReturnType<typeof createService>,
    records: Array<Record<string, any>>,
  ) {
    const metaById = new Map(
      records.map((record) => [
        record.chunk.resourceId,
        {
          id: record.chunk.resourceId,
          name: record.chunk.title,
          attrs: {
            link_id: record.linkId,
            guid: record.guid,
            url: record.feedUrl || 'https://news.example.com/feed.xml',
          },
          resourceType: ResourceType.RSS_ITEM,
        },
      ]),
    );
    wizardApiService.search.mockImplementation((request: any) =>
      Promise.resolve({ records: request.offset === 0 ? records : [] }),
    );
    resourcesService.batchGetParentResources.mockImplementation(
      (_namespaceId: string, ids: string[]) =>
        Promise.resolve(new Map(ids.map((id) => [id, metaById.get(id)]))),
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
  }

  const rssItemCopyFixture = [
    ...rssItemCopyRecords('guid-one', [
      { id: 'one-copy-a', linkId: 'link-a' },
      { id: 'one-copy-b', linkId: 'link-b' },
      { id: 'one-copy-c', linkId: 'link-c' },
    ]),
    ...rssItemCopyRecords('guid-two', [
      { id: 'two-copy-a', linkId: 'link-a' },
      { id: 'two-copy-b', linkId: 'link-b' },
    ]),
  ];

  it('returns a semantically matched article once per feed, not once per folder', async () => {
    const context = createService();
    mockRssItemSemanticSearch(context, rssItemCopyFixture);

    const result = await context.service.searchPaginated(
      userId,
      namespaceId,
      'query',
      undefined,
      {},
      { offset: 0, limit: 20 },
    );

    // The surviving copy is the best-ranked one, so the page is stable.
    expect(result.items.map((item: any) => item.resourceId)).toEqual([
      'one-copy-a',
      'two-copy-a',
    ]);
    // The total counts articles, not stored copies: it used to promise five.
    expect(result.total).toBe(2);
  });

  it('collapses article copies for the unpaginated search too', async () => {
    const context = createService();
    mockRssItemSemanticSearch(context, rssItemCopyFixture);

    const result = await context.service.search(userId, namespaceId, 'query');

    expect(result.map((item: any) => item.resourceId)).toEqual([
      'one-copy-a',
      'two-copy-a',
    ]);
  });

  it('keeps two articles that share a guid across different feeds', async () => {
    const context = createService();
    mockRssItemSemanticSearch(context, [
      ...rssItemCopyRecords('shared-guid', [{ id: 'feed-one', linkId: 'a' }]),
      {
        ...rssItemCopyRecords('shared-guid', [
          { id: 'feed-two', linkId: 'z' },
        ])[0],
        feedUrl: 'https://other.example.com/feed.xml',
      },
    ]);

    const result = await context.service.searchPaginated(
      userId,
      namespaceId,
      'query',
      undefined,
      {},
      { offset: 0, limit: 20 },
    );

    expect(result.items.map((item: any) => item.resourceId)).toEqual([
      'feed-one',
      'feed-two',
    ]);
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
