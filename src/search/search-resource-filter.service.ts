import { Injectable } from '@nestjs/common';
import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';
import {
  DEFAULT_RESOURCE_SORT_BY,
  getDefaultResourceSortOrder,
  ResourceSortBy,
  ResourceSortOrder,
} from 'omniboxd/resources/resource-sort.types';
import { sortResourcesByName } from 'omniboxd/resources/utils/resource-name-sort';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { TagService } from 'omniboxd/tag/tag.service';
import {
  SmartFolderCondition,
  SmartFolderMatchMode,
} from 'omniboxd/smart-folders/entities/smart-folder-config.entity';
import { SmartFoldersMatcherService } from 'omniboxd/smart-folders/smart-folders-matcher.service';
import { SmartFoldersRuleService } from 'omniboxd/smart-folders/smart-folders-rule.service';
import { DocType } from './doc-type.enum';
import { IndexedDocDto, IndexedResourceDto } from './dto/indexed-doc.dto';

export interface SearchFilterOptions {
  conditions?: SmartFolderCondition[];
  matchMode?: SmartFolderMatchMode;
  sortBy?: ResourceSortBy;
  sortOrder?: ResourceSortOrder;
}

@Injectable()
export class SearchResourceFilterService {
  constructor(
    private readonly namespaceResourcesService: NamespaceResourcesService,
    private readonly resourcesService: ResourcesService,
    private readonly tagService: TagService,
    private readonly smartFoldersRuleService: SmartFoldersRuleService,
    private readonly smartFoldersMatcherService: SmartFoldersMatcherService,
  ) {}

  normalizeOptions(options?: SearchFilterOptions): SearchFilterOptions {
    return {
      ...options,
      conditions: this.smartFoldersRuleService.normalize(
        options?.conditions || [],
      ),
    };
  }

  async getMatchedResourceIds(
    namespaceId: string,
    resourceIds: string[],
    options?: SearchFilterOptions,
  ): Promise<Set<string> | null> {
    const conditions = options?.conditions || [];
    if (conditions.length <= 0) {
      return null;
    }

    const matchMode = options?.matchMode ?? SmartFolderMatchMode.ALL;
    const resources = await this.resourcesService.batchGetResources(
      namespaceId,
      resourceIds,
    );
    const resourcesWithTagNames = await this.withTagNames(
      namespaceId,
      resources,
    );
    return new Set(
      resourcesWithTagNames
        .filter((resource) =>
          this.smartFoldersMatcherService.matches(
            resource,
            conditions,
            matchMode,
          ),
        )
        .map((resource) => resource.id),
    );
  }

  async searchResourcesByFilters(
    userId: string,
    namespaceId: string,
    options: SearchFilterOptions,
  ): Promise<IndexedDocDto[]> {
    const visibleResources =
      await this.namespaceResourcesService.getAllResourcesByUser(
        userId,
        namespaceId,
      );
    const resourceIds = visibleResources.map((resource) => resource.id);
    const resources = await this.resourcesService.batchGetResources(
      namespaceId,
      resourceIds,
    );
    const conditions = options.conditions || [];
    if (conditions.length <= 0) {
      return this.sortResources(resources, options).map((resource) =>
        this.toIndexedResource(resource),
      );
    }

    const resourcesWithTagNames = await this.withTagNames(
      namespaceId,
      resources,
    );
    const matchMode = options.matchMode ?? SmartFolderMatchMode.ALL;
    const matched = resourcesWithTagNames.filter((resource) =>
      this.smartFoldersMatcherService.matches(resource, conditions, matchMode),
    );
    return this.sortResources(matched, options).map((resource) =>
      this.toIndexedResource(resource),
    );
  }

  private async withTagNames(
    namespaceId: string,
    resources: Resource[],
  ): Promise<Resource[]> {
    const tagIds = Array.from(
      new Set(resources.flatMap((resource) => resource.tagIds || [])),
    );
    if (tagIds.length <= 0) {
      return resources;
    }

    const tags = await this.tagService.getTagsByIds(namespaceId, tagIds);
    const tagsById = new Map(tags.map((tag) => [tag.id, tag]));
    return resources.map((resource) => {
      const resourceTags = (resource.tagIds || [])
        .map((tagId) => tagsById.get(tagId))
        .filter((tag) => tag !== undefined);
      return {
        ...resource,
        attrs: {
          ...resource.attrs,
          tags: resourceTags,
        },
      } as Resource;
    });
  }

  private sortResources(
    resources: Resource[],
    options?: SearchFilterOptions,
  ): Resource[] {
    const sortBy = options?.sortBy ?? DEFAULT_RESOURCE_SORT_BY;
    const sortOrder = options?.sortOrder ?? getDefaultResourceSortOrder(sortBy);
    if (sortBy === ResourceSortBy.NAME) {
      return sortResourcesByName(resources, sortOrder);
    }

    const direction = sortOrder === ResourceSortOrder.ASC ? 1 : -1;
    return [...resources].sort((left, right) => {
      const result = this.compareResources(left, right, sortBy);
      return result === 0
        ? left.id.localeCompare(right.id)
        : result * direction;
    });
  }

  private compareResources(
    left: Resource,
    right: Resource,
    sortBy: ResourceSortBy,
  ): number {
    switch (sortBy) {
      case ResourceSortBy.CREATED_AT:
        return left.createdAt.getTime() - right.createdAt.getTime();
      case ResourceSortBy.MANUAL:
        return Number(left.manualOrder || 0) - Number(right.manualOrder || 0);
      case ResourceSortBy.UPDATED_AT:
      default:
        return left.updatedAt.getTime() - right.updatedAt.getTime();
    }
  }

  private toIndexedResource(resource: Resource): IndexedResourceDto {
    return {
      type: DocType.RESOURCE,
      id: resource.id,
      resourceId: resource.id,
      title: resource.name || 'Untitled',
      content: resource.content || '',
      attrs: resource.attrs || {},
      resourceType: resource.resourceType || ResourceType.DOC,
    };
  }
}
