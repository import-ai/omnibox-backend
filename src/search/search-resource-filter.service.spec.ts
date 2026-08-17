import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import {
  SmartFolderField,
  SmartFolderMatchMode,
  SmartFolderOperator,
} from 'omniboxd/smart-folders/entities/smart-folder-config.entity';
import { SmartFoldersMatcherService } from 'omniboxd/smart-folders/smart-folders-matcher.service';

import { SearchResourceFilterService } from './search-resource-filter.service';

describe('SearchResourceFilterService', () => {
  const namespaceId = 'namespace-id';
  const userId = 'user-id';

  function resource(values: any) {
    return {
      id: 'resource-id',
      name: 'Resource title',
      attrs: {},
      resourceType: ResourceType.DOC,
      content: '',
      tagIds: [],
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      updatedAt: new Date('2026-05-01T00:00:00.000Z'),
      ...values,
    };
  }

  function createService() {
    const namespaceResourcesService = {
      getAllResourcesByUser: jest
        .fn()
        .mockResolvedValue([
          { id: 'older-resource-id' },
          { id: 'newer-resource-id' },
        ]),
    };
    const resourcesService = {
      batchGetResources: jest.fn().mockResolvedValue([
        resource({
          id: 'older-resource-id',
          name: 'Older Roadmap',
          tagIds: ['tag-id'],
          updatedAt: new Date('2026-05-01T00:00:00.000Z'),
        }),
        resource({
          id: 'newer-resource-id',
          name: 'Newer Roadmap',
          tagIds: ['tag-id'],
          updatedAt: new Date('2026-05-02T00:00:00.000Z'),
        }),
      ]),
    };
    const tagService = {
      getTagsByIds: jest.fn().mockResolvedValue([
        {
          id: 'tag-id',
          name: 'Roadmap',
        },
      ]),
    };
    const ruleService = {
      normalize: jest.fn((conditions) => conditions),
    };
    const service = new SearchResourceFilterService(
      namespaceResourcesService as any,
      resourcesService as any,
      tagService as any,
      ruleService as any,
      new SmartFoldersMatcherService(),
    );

    return {
      resourcesService,
      ruleService,
      service,
      tagService,
    };
  }

  it('normalizes conditions with the smart folder rule service', () => {
    const { ruleService, service } = createService();
    const conditions = [
      {
        field: SmartFolderField.TITLE,
        operator: SmartFolderOperator.CONTAINS,
        value: 'roadmap',
      },
    ];

    const result = service.normalizeOptions({ conditions });

    expect(ruleService.normalize).toHaveBeenCalledWith(conditions);
    expect(result.conditions).toBe(conditions);
  });

  it('filters visible resources with smart folder matching and default ordering', async () => {
    const { resourcesService, service, tagService } = createService();
    const result = await service.searchResourcesByFilters(userId, namespaceId, {
      conditions: [
        {
          field: SmartFolderField.TAGS,
          operator: SmartFolderOperator.CONTAINS,
          value: 'roadmap',
        },
      ],
      matchMode: SmartFolderMatchMode.ALL,
    });

    expect(resourcesService.batchGetResources).toHaveBeenCalledWith(
      namespaceId,
      ['older-resource-id', 'newer-resource-id'],
    );
    expect(tagService.getTagsByIds).toHaveBeenCalledWith(namespaceId, [
      'tag-id',
    ]);
    expect(result.map((item: any) => item.resourceId)).toEqual([
      'newer-resource-id',
      'older-resource-id',
    ]);
  });

  function createServiceWithResources(
    resources: any[],
    resourceIds?: string[],
  ) {
    const ids = resourceIds ?? resources.map((item) => item.id);
    const namespaceResourcesService = {
      getAllResourcesByUser: jest
        .fn()
        .mockResolvedValue(ids.map((id) => ({ id }))),
    };
    const resourcesService = {
      batchGetResources: jest.fn().mockResolvedValue(resources),
    };
    const tagService = {
      getTagsByIds: jest
        .fn()
        .mockResolvedValue([{ id: 'tag-id', name: 'Roadmap' }]),
    };
    const ruleService = { normalize: jest.fn((conditions) => conditions) };
    const service = new SearchResourceFilterService(
      namespaceResourcesService as any,
      resourcesService as any,
      tagService as any,
      ruleService as any,
      new SmartFoldersMatcherService(),
    );

    return { service };
  }

  const tagCondition = {
    field: SmartFolderField.TAGS,
    operator: SmartFolderOperator.CONTAINS,
    value: 'roadmap',
  };

  // An rss item is a content resource like a doc and an rss folder a container
  // like a folder: the filter applies the same rules to both, with no
  // type-based exclusion of the subscription subtree.
  it('includes rss folders and the items inside them in smart folder matches', async () => {
    const { service } = createServiceWithResources([
      resource({ id: 'doc-id', name: 'Doc', tagIds: ['tag-id'] }),
      resource({
        id: 'rss-folder-id',
        name: 'Feeds',
        resourceType: ResourceType.RSS_FOLDER,
        tagIds: ['tag-id'],
      }),
      resource({
        id: 'rss-child-id',
        name: 'Feed item',
        parentId: 'rss-folder-id',
        resourceType: ResourceType.RSS_ITEM,
        tagIds: ['tag-id'],
      }),
    ]);

    const result = await service.searchResourcesByFilters(userId, namespaceId, {
      conditions: [tagCondition],
      matchMode: SmartFolderMatchMode.ALL,
    });

    expect(result.map((item: any) => item.resourceId)).toEqual([
      'doc-id',
      'rss-child-id',
      'rss-folder-id',
    ]);
  });

  it('includes rss folders and their items in getMatchedResourceIds', async () => {
    const resourceIds = ['doc-id', 'rss-folder-id', 'rss-child-id'];
    const { service } = createServiceWithResources(
      [
        resource({ id: 'doc-id', name: 'Doc', tagIds: ['tag-id'] }),
        resource({
          id: 'rss-folder-id',
          name: 'Feeds',
          resourceType: ResourceType.RSS_FOLDER,
          tagIds: ['tag-id'],
        }),
        resource({
          id: 'rss-child-id',
          name: 'Feed item',
          parentId: 'rss-folder-id',
          resourceType: ResourceType.RSS_ITEM,
          tagIds: ['tag-id'],
        }),
      ],
      resourceIds,
    );

    const matched = await service.getMatchedResourceIds(
      namespaceId,
      resourceIds,
      { conditions: [tagCondition], matchMode: SmartFolderMatchMode.ALL },
    );

    expect(matched && Array.from(matched)).toEqual([
      'doc-id',
      'rss-folder-id',
      'rss-child-id',
    ]);
  });

  // The point of dropping the exclusion: an article is findable by the words in
  // its body, exactly as a doc is.
  it('matches an rss item on its body text', async () => {
    const { service } = createServiceWithResources([
      resource({ id: 'doc-id', name: 'Doc', content: 'unrelated prose' }),
      resource({
        id: 'rss-item-id',
        name: 'Feed item',
        parentId: 'rss-folder-id',
        resourceType: ResourceType.RSS_ITEM,
        content: 'The quarterly rollout of the ranking pipeline',
      }),
    ]);

    const result = await service.searchResourcesByFilters(userId, namespaceId, {
      conditions: [
        {
          field: SmartFolderField.CONTENT,
          operator: SmartFolderOperator.CONTAINS,
          value: 'ranking pipeline',
        },
      ],
      matchMode: SmartFolderMatchMode.ALL,
    });

    expect(result.map((item: any) => item.resourceId)).toEqual(['rss-item-id']);
    expect((result[0] as any).readOnly).toBe(true);
  });

  it('returns default visible resources when no filter condition is provided', async () => {
    const { service, tagService } = createService();

    const result = await service.searchResourcesByFilters(userId, namespaceId, {
      conditions: [],
    });

    expect(tagService.getTagsByIds).not.toHaveBeenCalled();
    expect(result.map((item: any) => item.resourceId)).toEqual([
      'newer-resource-id',
      'older-resource-id',
    ]);
  });
});
