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
      { run: jest.fn() } as any,
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
