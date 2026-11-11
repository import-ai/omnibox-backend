import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { ConversationsService } from 'omniboxd/conversations/conversations.service';
import {
  childrenByMessage,
  isMessageIndexable,
  Message,
  OpenAIMessageRole,
} from 'omniboxd/messages/entities/message.entity';
import { MessagesService } from 'omniboxd/messages/messages.service';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { TagService } from 'omniboxd/tag/tag.service';
import { WizardTaskService } from 'omniboxd/tasks/wizard-task.service';
import { IndexRecordType } from 'omniboxd/wizard/dto/index-record.dto';
import { SearchRequestDto } from 'omniboxd/wizard/dto/search-request.dto';
import { WizardAPIService } from 'omniboxd/wizard-api/wizard-api.service';

import { DocType } from './doc-type.enum';
import { IndexedDocDto, IndexedMessageDto } from './dto/indexed-doc.dto';
import { WeaviateSyncStatsResponseDto } from './dto/weaviate-sync-stats-response.dto';
import { SearchCandidateService } from './search-candidate.service';
import {
  SearchFilterOptions,
  SearchResourceFilterService,
} from './search-resource-filter.service';
import { SearchSessionService } from './search-session.service';

const TASK_PRIORITY = 4;
const BACKFILL_PAGE_SIZE = 100;
const WEAVIATE_SYNC_LOG_EVERY = 1000;
const DEFAULT_SEARCH_LIMIT = 20;
const MAX_SEARCH_LIMIT = 100;
// History search asks for this many candidates per requested hit in a single
// Wizard call, so hits dropped as ineligible are backfilled without another
// round trip (auto-recall has a 1 s budget).
const HISTORY_CANDIDATE_FACTOR = 3;

export interface SearchPaginationOptions {
  offset?: number;
  limit?: number;
  paginationVersion?: number;
  searchId?: string;
  requestId?: string;
}

export interface SearchPaginatedResult {
  items: IndexedDocDto[];
  total: number | null;
  searchId?: string;
  nextOffset?: number;
  hasMore?: boolean;
  status?: string;
  recallTruncated?: boolean;
  offset: number;
  limit: number;
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly wizardApiService: WizardAPIService,
    private readonly permissionsService: PermissionsService,
    private readonly namespaceResourcesService: NamespaceResourcesService,
    private readonly resourcesService: ResourcesService,
    private readonly messagesService: MessagesService,
    private readonly conversationsService: ConversationsService,
    private readonly wizardTaskService: WizardTaskService,
    private readonly i18n: I18nService,
    private readonly tagService: TagService,
    private readonly searchResourceFilterService: SearchResourceFilterService,
    private readonly searchCandidateService: SearchCandidateService,
    private readonly searchSessions: SearchSessionService,
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
      return await this.searchMessages(
        userId,
        namespaceId,
        (query || '').trim(),
      );
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
    const result = await this.searchVisibleResources(
      userId,
      namespaceId,
      normalizedQuery,
      candidateResourceIds,
      0,
      MAX_SEARCH_LIMIT,
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
      const items = await this.searchMessages(
        userId,
        namespaceId,
        (query || '').trim(),
      );
      return {
        items: items.slice(offset, offset + limit),
        total: items.length,
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
      // The filter service cuts the page itself: it collapses the copies of an
      // article first, so slicing out here would page over an uncollapsed list.
      const result =
        await this.searchResourceFilterService.searchResourcesByFiltersWithTotal(
          userId,
          namespaceId,
          filterOptions,
          { offset, limit },
        );

      return {
        items: result.items,
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
    if (
      pagination?.paginationVersion !== 2 &&
      candidateResourceIds &&
      candidateResourceIds.length <= 0
    ) {
      return {
        items: [],
        total: 0,
        offset,
        limit,
      };
    }

    const result = await this.searchVisibleResources(
      userId,
      namespaceId,
      normalizedQuery,
      candidateResourceIds,
      offset,
      limit,
      pagination,
    );

    return { ...result, offset, limit };
  }

  private async searchVisibleResources(
    userId: string,
    namespaceId: string,
    normalizedQuery: string,
    candidateResourceIds: string[] | null,
    offset: number,
    limit: number,
    pagination?: SearchPaginationOptions,
  ): Promise<SearchPaginatedResult> {
    const result = await this.searchSessions.paginate(
      userId,
      namespaceId,
      normalizedQuery,
      candidateResourceIds,
      { ...pagination, offset, limit },
    );
    if (pagination?.paginationVersion === 2) return result;
    return { items: result.items, total: result.total, offset, limit };
  }

  async searchMessages(
    userId: string,
    namespaceId: string,
    normalizedQuery: string,
    history?: {
      limit?: number;
      conversationIds?: string[];
      excludeConversationIds?: string[];
    },
  ): Promise<IndexedMessageDto[]> {
    if (
      history &&
      !(await this.permissionsService.userInNamespace(userId, namespaceId))
    )
      return [];
    if (!normalizedQuery) {
      return [];
    }

    const searchRequest = new SearchRequestDto();
    searchRequest.query = normalizedQuery;
    searchRequest.namespaceId = namespaceId;
    searchRequest.userId = userId;
    searchRequest.type = IndexRecordType.MESSAGE;
    searchRequest.offset = 0;
    const historyLimit = history ? (history.limit ?? 10) : undefined;
    searchRequest.limit =
      historyLimit === undefined
        ? MAX_SEARCH_LIMIT
        : Math.min(historyLimit * HISTORY_CANDIDATE_FACTOR, MAX_SEARCH_LIMIT);
    const excluded = history?.excludeConversationIds ?? [];
    const included = history?.conversationIds?.length
      ? history.conversationIds.filter((id) => !excluded.includes(id))
      : undefined;
    if (included && !included.length) return [];
    searchRequest.conversationIds = included;
    searchRequest.excludeConversationIds = excluded;
    const result = await this.wizardApiService.search(searchRequest);
    const conversationChildren = new Map<string, Map<string, Message[]>>();
    const items: IndexedMessageDto[] = [];
    const conversationTitles = new Map<string, string | null>();
    const seenMessageIds = new Set<string>();
    // A message can rank with several chunks; load it once.
    const messageById = new Map<string, Message | null>();

    for (const record of result?.records || []) {
      if (record.type !== IndexRecordType.MESSAGE || !record.message) {
        continue;
      }

      const { conversationId, messageId } = record.message;
      const identity = history
        ? `${messageId}:${record.message.chunkIndex}`
        : messageId;
      if (
        !messageId ||
        seenMessageIds.has(identity) ||
        excluded.includes(conversationId) ||
        (included !== undefined && !included.includes(conversationId)) ||
        conversationTitles.get(conversationId) === null
      ) {
        continue;
      }

      let message = messageById.get(messageId);
      if (message === undefined) {
        try {
          message = await this.messagesService.findOne(messageId);
        } catch {
          message = null;
        }
        messageById.set(messageId, message);
      }
      if (
        !message ||
        message.conversationId !== conversationId ||
        message.userId !== userId ||
        (message.message.role !== OpenAIMessageRole.USER &&
          message.message.role !== OpenAIMessageRole.ASSISTANT)
      ) {
        continue;
      }
      // Only an assistant's eligibility depends on its children.
      if (
        message.message.role === OpenAIMessageRole.ASSISTANT &&
        !conversationChildren.has(conversationId)
      ) {
        conversationChildren.set(
          conversationId,
          childrenByMessage(
            await this.messagesService.findAll(userId, conversationId),
          ),
        );
      }
      if (
        !isMessageIndexable(
          message,
          conversationChildren.get(conversationId)?.get(message.id) || [],
        )
      ) {
        continue;
      }
      const content = message.message.content || '';
      if (!history && !this.matchesMessageQuery(content, normalizedQuery)) {
        continue;
      }

      let title = conversationTitles.get(conversationId);
      if (title === undefined) {
        const conversation =
          await this.conversationsService.get(conversationId);
        if (
          !conversation ||
          conversation.userId !== userId ||
          conversation.namespaceId !== namespaceId
        ) {
          conversationTitles.set(conversationId, null);
          continue;
        }
        title = conversation.title || '';
        conversationTitles.set(conversationId, title);
      }
      if (title === null) {
        continue;
      }
      seenMessageIds.add(identity);

      items.push({
        type: DocType.MESSAGE,
        id: messageId,
        messageId,
        conversationId,
        title,
        role: message.message.role,
        content: history ? record.message.message.content : content,
        ...(history
          ? {
              chunkIndex: record.message.chunkIndex,
              startIndex: record.message.startIndex,
              endIndex: record.message.endIndex,
              createdAt: message.createdAt?.toISOString(),
            }
          : {}),
      });
      if (historyLimit !== undefined && items.length >= historyLimit) break;
    }

    return items;
  }

  private matchesMessageQuery(content: unknown, normalizedQuery: string) {
    if (typeof content !== 'string') {
      return false;
    }

    const normalizedContent = content.toLocaleLowerCase();
    return normalizedQuery
      .toLocaleLowerCase()
      .split(/\s+/)
      .every((keyword) => normalizedContent.includes(keyword));
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

  private normalizePagination(pagination?: SearchPaginationOptions): {
    offset: number;
    limit: number;
  } {
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
        const allMessages = await this.messagesService.findAll(
          conversation.userId,
          conversation.id,
        );
        const children = childrenByMessage(allMessages);
        for (const message of allMessages) {
          await this.wizardTaskService.emitUpsertMessageIndexTask(
            TASK_PRIORITY,
            conversation.userId,
            conversation.namespaceId,
            conversation.id,
            message,
            undefined,
            children.get(message.id) || [],
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
        const messages = this.selectMessagesForIndex(
          await this.messagesService.findAll(
            conversation.userId,
            conversation.id,
          ),
        );
        for (const message of messages) {
          stats.scanned += 1;
          if (stats.scanned % WEAVIATE_SYNC_LOG_EVERY === 0) {
            this.logger.log(
              `Weaviate message sync: scanned=${stats.scanned} (synced=${stats.synced}, failed=${stats.failed}, skipped=${stats.skipped})`,
            );
          }
          if (updatedAfter && message.updatedAt <= updatedAfter) {
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

  private selectMessagesForIndex(messages: Message[]): Message[] {
    const children = childrenByMessage(messages);
    return messages.filter((message) =>
      isMessageIndexable(message, children.get(message.id) || []),
    );
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
