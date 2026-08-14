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

  // An item is stored once per subscribing folder, so a namespace with three
  // folders on one feed holds three resources per article. A reader wants the
  // article once.
  function feedItemCopies(
    guid: string,
    copies: Array<{ id: string; linkId: string; updatedAt: string }>,
    values: Record<string, any> = {},
  ) {
    return copies.map((copy) =>
      resource({
        id: copy.id,
        name: 'A shared article',
        parentId: `folder-of-${copy.linkId}`,
        resourceType: ResourceType.RSS_ITEM,
        updatedAt: new Date(copy.updatedAt),
        attrs: {
          link_id: copy.linkId,
          guid,
          url: 'https://news.example.com/feed.xml',
          article_url: `https://news.example.com/${guid}`,
        },
        ...values,
      }),
    );
  }

  const threeFoldersOnOneFeed = [
    ...feedItemCopies('guid-newer', [
      {
        id: 'newer-copy-a',
        linkId: 'link-a',
        updatedAt: '2026-05-04T10:00:00.100Z',
      },
      {
        id: 'newer-copy-b',
        linkId: 'link-b',
        updatedAt: '2026-05-04T10:00:00.050Z',
      },
      {
        id: 'newer-copy-c',
        linkId: 'link-c',
        updatedAt: '2026-05-04T10:00:00.000Z',
      },
    ]),
    ...feedItemCopies('guid-older', [
      {
        id: 'older-copy-a',
        linkId: 'link-a',
        updatedAt: '2026-05-03T10:00:00.100Z',
      },
      {
        id: 'older-copy-b',
        linkId: 'link-b',
        updatedAt: '2026-05-03T10:00:00.050Z',
      },
      {
        id: 'older-copy-c',
        linkId: 'link-c',
        updatedAt: '2026-05-03T10:00:00.000Z',
      },
    ]),
  ];

  const titleCondition = {
    field: SmartFolderField.TITLE,
    operator: SmartFolderOperator.CONTAINS,
    value: 'shared article',
  };

  it('returns an article once however many folders subscribe to its feed', async () => {
    const { service } = createServiceWithResources(threeFoldersOnOneFeed);

    const result = await service.searchResourcesByFiltersWithTotal(
      userId,
      namespaceId,
      { conditions: [titleCondition], matchMode: SmartFolderMatchMode.ALL },
    );

    // One row per article, and the surviving copy is the one the active
    // ordering puts first — not an arbitrary one of the three.
    expect(result.items.map((item: any) => item.resourceId)).toEqual([
      'newer-copy-a',
      'older-copy-a',
    ]);
    // The total is what a reader can page to, not the number of stored copies.
    expect(result.total).toBe(2);
  });

  it('pages over collapsed articles without repeating or skipping one', async () => {
    const { service } = createServiceWithResources(threeFoldersOnOneFeed);
    const options = {
      conditions: [titleCondition],
      matchMode: SmartFolderMatchMode.ALL,
    };

    const firstPage = await service.searchResourcesByFiltersWithTotal(
      userId,
      namespaceId,
      options,
      { offset: 0, limit: 1 },
    );
    const secondPage = await service.searchResourcesByFiltersWithTotal(
      userId,
      namespaceId,
      options,
      { offset: 1, limit: 1 },
    );
    const thirdPage = await service.searchResourcesByFiltersWithTotal(
      userId,
      namespaceId,
      options,
      { offset: 2, limit: 1 },
    );

    expect(firstPage.items.map((item: any) => item.resourceId)).toEqual([
      'newer-copy-a',
    ]);
    // Collapsing before the slice: a full page of one, not a page emptied by
    // dropping the duplicates the slice happened to contain.
    expect(secondPage.items.map((item: any) => item.resourceId)).toEqual([
      'older-copy-a',
    ]);
    expect(thirdPage.items).toEqual([]);
    expect(firstPage.total).toBe(2);
  });

  it('leaves resources that are not rss items alone', async () => {
    const { service } = createServiceWithResources([
      resource({
        id: 'doc-a',
        name: 'A shared article',
        updatedAt: new Date('2026-05-06T00:00:00.000Z'),
      }),
      resource({
        id: 'doc-b',
        name: 'A shared article',
        updatedAt: new Date('2026-05-05T00:00:00.000Z'),
      }),
      // A doc does not gain an identity from an attrs.guid it happens to carry.
      resource({
        id: 'doc-c',
        name: 'A shared article',
        attrs: { guid: 'guid-newer', url: 'https://news.example.com/feed.xml' },
        updatedAt: new Date('2026-05-04T00:00:00.000Z'),
      }),
    ]);

    const result = await service.searchResourcesByFiltersWithTotal(
      userId,
      namespaceId,
      { conditions: [titleCondition], matchMode: SmartFolderMatchMode.ALL },
    );

    expect(result.items.map((item: any) => item.resourceId)).toEqual([
      'doc-a',
      'doc-b',
      'doc-c',
    ]);
    expect(result.total).toBe(3);
  });

  it('keeps both articles when two feeds share a guid', async () => {
    const { service } = createServiceWithResources([
      ...feedItemCopies('shared-guid', [
        {
          id: 'feed-one-copy',
          linkId: 'link-a',
          updatedAt: '2026-05-04T10:00:00.000Z',
        },
      ]),
      resource({
        id: 'feed-two-copy',
        name: 'A shared article',
        resourceType: ResourceType.RSS_ITEM,
        updatedAt: new Date('2026-05-04T09:00:00.000Z'),
        attrs: {
          link_id: 'link-z',
          guid: 'shared-guid',
          url: 'https://other.example.com/feed.xml',
        },
      }),
    ]);

    const result = await service.searchResourcesByFiltersWithTotal(
      userId,
      namespaceId,
      { conditions: [titleCondition], matchMode: SmartFolderMatchMode.ALL },
    );

    expect(result.items.map((item: any) => item.resourceId)).toEqual([
      'feed-one-copy',
      'feed-two-copy',
    ]);
  });

  // Before this, a filtered search shipped every matched body in full: one
  // page of feed articles measured 743 KB, 675 KB of it article text.
  it('ships a content snippet rather than the whole body', async () => {
    const body = `${'article prose '.repeat(200)}ranking pipeline`;
    const { service } = createServiceWithResources([
      resource({
        id: 'rss-item-id',
        name: 'Feed item',
        resourceType: ResourceType.RSS_ITEM,
        content: `![cover](https://news.example.com/cover.png)${body}`,
        attrs: { link_id: 'link-a', guid: 'guid-1' },
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

    // Matching still reads the whole body; only what goes on the wire is cut,
    // to the same hundred characters a folder listing carries, images stripped.
    expect(result).toHaveLength(1);
    expect((result[0] as any).content).toBe(body.slice(0, 100));
    expect((result[0] as any).content.length).toBe(100);
  });
});
