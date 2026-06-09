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
