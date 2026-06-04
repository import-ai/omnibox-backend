import { Injectable } from '@nestjs/common';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import {
  SmartFolderCondition,
  SmartFolderMatchMode,
} from 'omniboxd/smart-folders/entities/smart-folder-config.entity';
import { SmartFoldersMatcherService } from 'omniboxd/smart-folders/smart-folders-matcher.service';
import { SmartFoldersRuleService } from 'omniboxd/smart-folders/smart-folders-rule.service';
import { TagService } from 'omniboxd/tag/tag.service';
import { DocType } from './doc-type.enum';
import { IndexedDocDto, IndexedResourceDto } from './dto/indexed-doc.dto';

export interface SearchFilterOptions {
  conditions?: SmartFolderCondition[];
  matchMode?: SmartFolderMatchMode;
}

export interface SearchFilterResult {
  items: IndexedDocDto[];
  total: number;
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

    const resources = await this.resourcesService.batchGetResources(
      namespaceId,
      resourceIds,
    );
    const resourcesWithTagNames = await this.withTagNames(
      namespaceId,
      resources,
    );
    const matchMode = options?.matchMode ?? SmartFolderMatchMode.ALL;

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
    const result = await this.searchResourcesByFiltersWithTotal(
      userId,
      namespaceId,
      options,
    );

    return result.items;
  }

  async searchResourcesByFiltersWithTotal(
    userId: string,
    namespaceId: string,
    options: SearchFilterOptions,
  ): Promise<SearchFilterResult> {
    const visibleResources =
      await this.namespaceResourcesService.getAllResourcesByUser(
        userId,
        namespaceId,
      );
    const resources = await this.resourcesService.batchGetResources(
      namespaceId,
      visibleResources.map((resource) => resource.id),
    );
    const conditions = options.conditions || [];
    if (conditions.length <= 0) {
      const items = this.sortResources(resources).map((resource) =>
        this.toIndexedResource(resource),
      );

      return {
        items,
        total: items.length,
      };
    }

    const resourcesWithTagNames = await this.withTagNames(
      namespaceId,
      resources,
    );
    const matchMode = options.matchMode ?? SmartFolderMatchMode.ALL;
    const matched = resourcesWithTagNames.filter((resource) =>
      this.smartFoldersMatcherService.matches(resource, conditions, matchMode),
    );

    const items = this.sortResources(matched).map((resource) =>
      this.toIndexedResource(resource),
    );

    return {
      items,
      total: items.length,
    };
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

  private sortResources(resources: Resource[]): Resource[] {
    return [...resources].sort((left, right) => {
      const updatedAtDiff =
        right.updatedAt.getTime() - left.updatedAt.getTime();
      return updatedAtDiff === 0
        ? left.id.localeCompare(right.id)
        : updatedAtDiff;
    });
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
