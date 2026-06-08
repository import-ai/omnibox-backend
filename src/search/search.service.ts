import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { DocType } from './doc-type.enum';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import { IndexedDocDto, IndexedResourceDto } from './dto/indexed-doc.dto';
import { WeaviateSyncStatsResponseDto } from './dto/weaviate-sync-stats-response.dto';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import {
  comparePermission,
  ResourcePermission,
} from 'omniboxd/permissions/resource-permission.enum';
import { WizardAPIService } from 'omniboxd/wizard-api/wizard-api.service';
import { SearchRequestDto } from 'omniboxd/wizard/dto/search-request.dto';
import { IndexRecordType } from 'omniboxd/wizard/dto/index-record.dto';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { Repository } from 'typeorm';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { WizardTaskService } from 'omniboxd/tasks/wizard-task.service';
import { MessagesService } from 'omniboxd/messages/messages.service';
import { ConversationsService } from 'omniboxd/conversations/conversations.service';
import { ResourcesService } from 'omniboxd/resources/resources.service';

import { I18nService } from 'nestjs-i18n';
import { OpenAIMessageRole } from 'omniboxd/messages/entities/message.entity';
import { Resource } from 'omniboxd/resources/entities/resource.entity';
import { Message } from 'omniboxd/messages/entities/message.entity';
import { TagService } from 'omniboxd/tag/tag.service';
import {
  SearchFilterOptions,
  SearchResourceFilterService,
} from './search-resource-filter.service';
import { SearchCandidateService } from './search-candidate.service';

const TASK_PRIORITY = 4;
const BACKFILL_PAGE_SIZE = 100;
const WEAVIATE_SYNC_LOG_EVERY = 1000;
const DEFAULT_SEARCH_LIMIT = 20;
const MAX_SEARCH_LIMIT = 100;
const SEMANTIC_SEARCH_PAGE_SIZE = 100;
const SEMANTIC_SEARCH_CACHE_TTL_MS = 30 * 1000;
const SEMANTIC_SEARCH_CACHE_MAX_ENTRIES = 100;
const SEMANTIC_SEARCH_CACHE_MAX_ITEMS = 2000;

export interface SearchPaginationOptions {
  offset?: number;
  limit?: number;
}

export interface SearchPaginatedResult {
  items: IndexedDocDto[];
  total: number;
  offset: number;
  limit: number;
}

interface SemanticSearchCacheEntry {
  expiresAt: number;
  hasMoreRawResults: boolean;
  items: IndexedDocDto[];
  nextSearchOffset: number;
  seenResourceIds: Set<string>;
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  private readonly semanticSearchCache = new Map<
    string,
    SemanticSearchCacheEntry
  >();

  constructor(
    private readonly wizardApiService: WizardAPIService,
    private readonly permissionsService: PermissionsService,
    private readonly namespaceResourcesService: NamespaceResourcesService,
    private readonly resourcesService: ResourcesService,
    private readonly messagesService: MessagesService,
    private readonly conversationsService: ConversationsService,
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    private readonly wizardTaskService: WizardTaskService,
    private readonly i18n: I18nService,
    private readonly tagService: TagService,
    private readonly searchResourceFilterService: SearchResourceFilterService,
    private readonly searchCandidateService: SearchCandidateService,
  ) {}

  async search(
    userId: string,
    namespaceId: string,
    query: string,
    type?: DocType,
    options?: SearchFilterOptions,
  ) {
    const hasAccess = await this.permissionsService.userInNamespace(
      userId,
      namespaceId,
    );
    if (!hasAccess) {
      const message = this.i18n.t('auth.errors.notAuthorized');
      throw new AppException(message, 'NOT_AUTHORIZED', HttpStatus.FORBIDDEN);
    }
    if (type === DocType.MESSAGE) {
      return [];
    }
    const normalizedQuery = (query || '').trim();
    const filterOptions =
      this.searchResourceFilterService.normalizeOptions(options);
    if (!normalizedQuery) {
      if ((filterOptions.conditions || []).length <= 0) {
        return [];
      }
      return await this.searchResourceFilterService.searchResourcesByFilters(
        userId,
        namespaceId,
        filterOptions,
      );
    }
    const candidateResourceIds = await this.getFilterCandidateResourceIds(
      userId,
      namespaceId,
      filterOptions,
    );
    if (candidateResourceIds && candidateResourceIds.length <= 0) {
      return [];
    }
    const result = await this.searchSemanticResources(
      userId,
      namespaceId,
      normalizedQuery,
      candidateResourceIds,
      {
        offset: 0,
        limit: MAX_SEARCH_LIMIT,
      },
    );
    return result.items;
  }

  async searchPaginated(
    userId: string,
    namespaceId: string,
    query: string,
    type?: DocType,
    options?: SearchFilterOptions,
    pagination?: SearchPaginationOptions,
  ): Promise<SearchPaginatedResult> {
    const { offset, limit } = this.normalizePagination(pagination);
    const hasAccess = await this.permissionsService.userInNamespace(
      userId,
      namespaceId,
    );
    if (!hasAccess) {
      const message = this.i18n.t('auth.errors.notAuthorized');
      throw new AppException(message, 'NOT_AUTHORIZED', HttpStatus.FORBIDDEN);
    }
    if (type === DocType.MESSAGE) {
      return {
        items: [],
        total: 0,
        offset,
        limit,
      };
    }
    const normalizedQuery = (query || '').trim();
    const filterOptions =
      this.searchResourceFilterService.normalizeOptions(options);
    if (!normalizedQuery) {
      if ((filterOptions.conditions || []).length <= 0) {
        return {
          items: [],
          total: 0,
          offset,
          limit,
        };
      }
      const result =
        await this.searchResourceFilterService.searchResourcesByFiltersWithTotal(
          userId,
          namespaceId,
          filterOptions,
        );

      return {
        items: result.items.slice(offset, offset + limit),
        total: result.total,
        offset,
        limit,
      };
    }

    const candidateResourceIds = await this.getFilterCandidateResourceIds(
      userId,
      namespaceId,
      filterOptions,
    );
    if (candidateResourceIds && candidateResourceIds.length <= 0) {
      return {
        items: [],
        total: 0,
        offset,
        limit,
      };
    }

    const result = await this.searchSemanticResourcesPaginated(
      userId,
      namespaceId,
      normalizedQuery,
      candidateResourceIds,
      offset,
      limit,
    );

    return {
      items: result.items,
      total: result.total,
      offset,
      limit,
    };
  }

  private async searchSemanticResourcesPaginated(
    userId: string,
    namespaceId: string,
    normalizedQuery: string,
    candidateResourceIds: string[] | null,
    offset: number,
    limit: number,
  ): Promise<Pick<SearchPaginatedResult, 'items' | 'total'>> {
    const requestedItemCount = offset + limit;
    const cacheKey = this.getSemanticSearchCacheKey(
      userId,
      namespaceId,
      normalizedQuery,
      candidateResourceIds,
    );
    const cachedEntry = this.getSemanticSearchCacheEntry(cacheKey);
    const cacheEntry = cachedEntry || this.createSemanticSearchCacheEntry();
    const cachedItemCount = cachedEntry?.items.length ?? 0;

    for (
      ;
      cacheEntry.items.length < requestedItemCount &&
      cacheEntry.hasMoreRawResults;
    ) {
      const searchPage = await this.searchSemanticResources(
        userId,
        namespaceId,
        normalizedQuery,
        candidateResourceIds,
        {
          offset: cacheEntry.nextSearchOffset,
          limit: SEMANTIC_SEARCH_PAGE_SIZE,
        },
      );
      cacheEntry.nextSearchOffset += searchPage.limit;
      for (const item of searchPage.items) {
        if (item.type === DocType.RESOURCE) {
          if (cacheEntry.seenResourceIds.has(item.resourceId)) {
            continue;
          }
          cacheEntry.seenResourceIds.add(item.resourceId);
        }
        cacheEntry.items.push(item);
      }
      cacheEntry.hasMoreRawResults = searchPage.rawCount >= searchPage.limit;
    }
    this.setSemanticSearchCacheEntry(cacheKey, cacheEntry);
    const items = cacheEntry.items.slice(offset, requestedItemCount);
    const shouldRefreshCachedPermissions =
      cachedEntry !== null && offset < cachedItemCount;

    return {
      items: shouldRefreshCachedPermissions
        ? await this.refreshCachedResourcePermissions(
            userId,
            namespaceId,
            items,
          )
        : items,
      total: cacheEntry.items.length,
    };
  }

  private async refreshCachedResourcePermissions(
    userId: string,
    namespaceId: string,
    items: IndexedDocDto[],
  ): Promise<IndexedDocDto[]> {
    const resourceIds = items
      .filter((item) => item.type === DocType.RESOURCE)
      .map((item) => item.resourceId);
    if (resourceIds.length <= 0) {
      return items;
    }

    const resourceMetaMap = await this.resourcesService.batchGetParentResources(
      namespaceId,
      resourceIds,
    );
    const permissionMap = await this.permissionsService.getCurrentPermissions(
      userId,
      namespaceId,
      [...resourceMetaMap.values()],
    );

    const visibleItems: IndexedDocDto[] = [];
    for (const item of items) {
      if (item.type !== DocType.RESOURCE) {
        visibleItems.push(item);
        continue;
      }
      const permission = permissionMap.get(item.resourceId);
      if (
        !permission ||
        comparePermission(permission, ResourcePermission.CAN_VIEW) < 0
      ) {
        continue;
      }

      const resourceMeta = resourceMetaMap.get(item.resourceId);
      visibleItems.push({
        ...item,
        attrs: resourceMeta?.attrs || {},
        resourceType: resourceMeta?.resourceType || ResourceType.DOC,
      });
    }

    return visibleItems;
  }

  private createSemanticSearchCacheEntry(): SemanticSearchCacheEntry {
    return {
      expiresAt: Date.now() + SEMANTIC_SEARCH_CACHE_TTL_MS,
      hasMoreRawResults: true,
      items: [],
      nextSearchOffset: 0,
      seenResourceIds: new Set<string>(),
    };
  }

  private getSemanticSearchCacheEntry(
    key: string,
  ): SemanticSearchCacheEntry | null {
    const entry = this.semanticSearchCache.get(key);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt <= Date.now()) {
      this.semanticSearchCache.delete(key);
      return null;
    }
    this.semanticSearchCache.delete(key);
    this.semanticSearchCache.set(key, entry);
    return entry;
  }

  private setSemanticSearchCacheEntry(
    key: string,
    entry: SemanticSearchCacheEntry,
  ) {
    if (entry.items.length > SEMANTIC_SEARCH_CACHE_MAX_ITEMS) {
      this.semanticSearchCache.delete(key);
      return;
    }
    entry.expiresAt = Date.now() + SEMANTIC_SEARCH_CACHE_TTL_MS;
    this.semanticSearchCache.delete(key);
    this.semanticSearchCache.set(key, entry);
    while (this.semanticSearchCache.size > SEMANTIC_SEARCH_CACHE_MAX_ENTRIES) {
      const oldestKey = this.semanticSearchCache.keys().next().value as
        | string
        | undefined;
      if (oldestKey === undefined) {
        break;
      }
      this.semanticSearchCache.delete(oldestKey);
    }
  }

  private getSemanticSearchCacheKey(
    userId: string,
    namespaceId: string,
    normalizedQuery: string,
    candidateResourceIds: string[] | null,
  ): string {
    const candidateHash = candidateResourceIds
      ? createHash('sha256')
          .update(candidateResourceIds.join('\0'))
          .digest('hex')
      : 'all';

    return [userId, namespaceId, normalizedQuery, candidateHash].join('\0');
  }

  private async searchSemanticResources(
    userId: string,
    namespaceId: string,
    normalizedQuery: string,
    candidateResourceIds: string[] | null,
    pagination: Required<SearchPaginationOptions>,
  ): Promise<{
    items: IndexedDocDto[];
    limit: number;
    rawCount: number;
  }> {
    const searchRequest = new SearchRequestDto();
    searchRequest.query = normalizedQuery;
    searchRequest.namespaceId = namespaceId;
    searchRequest.userId = userId;
    searchRequest.limit = Math.min(
      Math.max(pagination.limit, 1),
      MAX_SEARCH_LIMIT,
    );
    searchRequest.offset = Math.max(pagination.offset, 0);
    searchRequest.type = IndexRecordType.CHUNK;
    searchRequest.resourceIds = candidateResourceIds || undefined;
    const result = await this.wizardApiService.search(searchRequest);
    const records = result?.records || [];
    const items: IndexedDocDto[] = [];
    const seenResourceIds = new Set<string>();
    const candidateResourceIdSet = candidateResourceIds
      ? new Set(candidateResourceIds)
      : null;
    for (const record of records) {
      if (record.type === IndexRecordType.CHUNK) {
        const chunk = record.chunk!;
        if (
          candidateResourceIdSet &&
          !candidateResourceIdSet.has(chunk.resourceId)
        ) {
          continue;
        }
        if (!seenResourceIds.has(chunk.resourceId)) {
          seenResourceIds.add(chunk.resourceId);
        }
      }
    }

    const resourceMetaMap = await this.resourcesService.batchGetParentResources(
      namespaceId,
      [...seenResourceIds],
    );
    const permissionMap = await this.permissionsService.getCurrentPermissions(
      userId,
      namespaceId,
      [...resourceMetaMap.values()],
    );

    seenResourceIds.clear();

    for (const record of records) {
      if (record.type === IndexRecordType.CHUNK) {
        const chunk = record.chunk!;
        if (seenResourceIds.has(chunk.resourceId)) {
          continue;
        }
        if (
          candidateResourceIdSet &&
          !candidateResourceIdSet.has(chunk.resourceId)
        ) {
          continue;
        }
        seenResourceIds.add(chunk.resourceId);
        const permission = permissionMap.get(chunk.resourceId);
        if (
          !permission ||
          comparePermission(permission, ResourcePermission.CAN_VIEW) < 0
        ) {
          continue;
        }

        const resourceMeta = resourceMetaMap.get(chunk.resourceId);
        const resourceDto: IndexedResourceDto = {
          type: DocType.RESOURCE,
          id: record.id,
          resourceId: chunk.resourceId,
          title: chunk.title || 'Untitled',
          content: chunk.text || '',
          attrs: resourceMeta?.attrs || {},
          resourceType: resourceMeta?.resourceType || ResourceType.DOC,
        };
        items.push(resourceDto);
      }
    }

    return {
      items,
      limit: searchRequest.limit,
      rawCount: records.length,
    };
  }

  private async getFilterCandidateResourceIds(
    userId: string,
    namespaceId: string,
    filterOptions: SearchFilterOptions,
  ): Promise<string[] | null> {
    return await this.searchCandidateService.getFilterCandidateResourceIds(
      userId,
      namespaceId,
      filterOptions,
    );
  }

  private normalizePagination(
    pagination?: SearchPaginationOptions,
  ): Required<SearchPaginationOptions> {
    const offset = Number.isInteger(pagination?.offset)
      ? Math.max(pagination!.offset!, 0)
      : 0;
    const limit = Number.isInteger(pagination?.limit)
      ? Math.min(Math.max(pagination!.limit!, 1), MAX_SEARCH_LIMIT)
      : DEFAULT_SEARCH_LIMIT;

    return {
      offset,
      limit,
    };
  }

  async refreshResourceIndex() {
    const limit = 100;
    let offset = 0;
    while (true) {
      const resources = await this.namespaceResourcesService.listAllResources(
        offset,
        limit,
      );
      if (resources.length === 0) {
        break;
      }
      offset += resources.length;
      for (const resource of resources) {
        if (!resource.userId) {
          continue;
        }
        await this.wizardTaskService.emitUpsertIndexTask(
          TASK_PRIORITY,
          resource.userId,
          resource,
        );
      }
    }
  }

  async refreshMessageIndex() {
    const limit = 100;
    let offset = 0;
    while (true) {
      const conversations = await this.conversationsService.listAll(
        offset,
        limit,
      );
      if (conversations.length === 0) {
        break;
      }
      offset += conversations.length;
      for (const conversation of conversations) {
        if (!conversation.userId) {
          continue;
        }
        const messages = await this.messagesService.findAll(
          conversation.userId,
          conversation.id,
        );
        for (const message of messages) {
          await this.wizardTaskService.emitUpsertMessageIndexTask(
            TASK_PRIORITY,
            conversation.userId,
            conversation.namespaceId,
            conversation.id,
            message,
          );
        }
      }
    }
  }

  async syncResourcesToWeaviate(
    concurrency: number,
    updatedAfter?: Date,
  ): Promise<WeaviateSyncStatsResponseDto> {
    const stats: WeaviateSyncStatsResponseDto = {
      scanned: 0,
      synced: 0,
      skipped: 0,
      failed: 0,
    };
    let offset = 0;

    while (true) {
      const resources = await this.namespaceResourcesService.listAllResources(
        offset,
        BACKFILL_PAGE_SIZE,
      );
      if (resources.length === 0) {
        break;
      }
      offset += resources.length;

      const tasks: (() => Promise<void>)[] = [];
      for (const resource of resources) {
        stats.scanned += 1;
        if (stats.scanned % WEAVIATE_SYNC_LOG_EVERY === 0) {
          this.logger.log(
            `Weaviate resource sync: scanned=${stats.scanned} (synced=${stats.synced}, failed=${stats.failed}, skipped=${stats.skipped})`,
          );
        }
        if (!this.shouldSyncResource(resource, updatedAfter)) {
          stats.skipped += 1;
          continue;
        }
        tasks.push(async () => {
          try {
            const resourceTagIds = resource.tagIds || [];
            const tags = await this.tagService.findByIds(
              resource.namespaceId,
              resourceTagIds,
            );
            const tagNamesById = new Map(tags.map((tag) => [tag.id, tag.name]));
            const result = await this.wizardApiService.upsertWeaviateResource({
              namespaceId: resource.namespaceId,
              title: resource.name || '',
              content: resource.content || '',
              resourceId: resource.id,
              parentId: resource.parentId!,
              resourceTagIds,
              resourceTagNames: resourceTagIds.flatMap((id) => {
                const name = tagNamesById.get(id);
                return name ? [name] : [];
              }),
            });
            if (result.success) {
              stats.synced += 1;
            } else {
              stats.failed += 1;
            }
          } catch {
            stats.failed += 1;
          }
        });
      }
      await this.runWithConcurrency(tasks, concurrency);
    }

    return stats;
  }

  async syncMessagesToWeaviate(
    concurrency: number,
    updatedAfter?: Date,
  ): Promise<WeaviateSyncStatsResponseDto> {
    const stats: WeaviateSyncStatsResponseDto = {
      scanned: 0,
      synced: 0,
      skipped: 0,
      failed: 0,
    };
    let offset = 0;

    while (true) {
      const conversations = await this.conversationsService.listAll(
        offset,
        BACKFILL_PAGE_SIZE,
      );
      if (conversations.length === 0) {
        break;
      }
      offset += conversations.length;

      const tasks: (() => Promise<void>)[] = [];
      for (const conversation of conversations) {
        if (!conversation.userId) {
          continue;
        }
        const messages = await this.messagesService.findAll(
          conversation.userId,
          conversation.id,
        );
        for (const message of messages) {
          stats.scanned += 1;
          if (stats.scanned % WEAVIATE_SYNC_LOG_EVERY === 0) {
            this.logger.log(
              `Weaviate message sync: scanned=${stats.scanned} (synced=${stats.synced}, failed=${stats.failed}, skipped=${stats.skipped})`,
            );
          }
          if (!this.shouldSyncMessage(message, updatedAfter)) {
            stats.skipped += 1;
            continue;
          }
          tasks.push(async () => {
            try {
              const result = await this.wizardApiService.upsertWeaviateMessage({
                namespaceId: conversation.namespaceId,
                userId: conversation.userId!,
                message: {
                  conversationId: conversation.id,
                  messageId: message.id,
                  message: {
                    role: message.message.role,
                    content: message.message.content || '',
                  },
                },
              });
              if (result.success) {
                stats.synced += 1;
              } else {
                stats.failed += 1;
              }
            } catch {
              stats.failed += 1;
            }
          });
        }
      }
      await this.runWithConcurrency(tasks, concurrency);
    }

    return stats;
  }

  async syncWeaviateBackfill(concurrency: number, updatedAfter?: Date) {
    this.logger.log(
      `syncWeaviateBackfill: concurrency=${concurrency}, updatedAfter=${updatedAfter?.toISOString()}`,
    );
    const resources = await this.syncResourcesToWeaviate(
      concurrency,
      updatedAfter,
    );
    const messages = await this.syncMessagesToWeaviate(
      concurrency,
      updatedAfter,
    );
    return { resources, messages };
  }

  private shouldSyncResource(resource: Resource, updatedAfter?: Date): boolean {
    if (updatedAfter && resource.updatedAt <= updatedAfter) {
      return false;
    }
    if (resource.resourceType === ResourceType.FOLDER) {
      return false;
    }
    if (!resource.parentId) {
      return false;
    }
    return true;
  }

  private shouldSyncMessage(message: Message, updatedAfter?: Date): boolean {
    if (updatedAfter && message.updatedAt <= updatedAfter) {
      return false;
    }
    const content = message.message.content || '';
    if (!content.trim()) {
      return false;
    }
    if (
      [OpenAIMessageRole.TOOL, OpenAIMessageRole.SYSTEM].includes(
        message.message.role,
      )
    ) {
      return false;
    }
    return true;
  }

  private async runWithConcurrency(
    tasks: (() => Promise<void>)[],
    concurrency: number,
  ): Promise<void> {
    let index = 0;
    const workers = Array.from(
      { length: Math.min(concurrency, tasks.length) },
      async () => {
        while (index < tasks.length) {
          const i = index++;
          await tasks[i]();
        }
      },
    );
    await Promise.all(workers);
  }
}
