import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { DocType } from './doc-type.enum';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import {
  IndexedDocDto,
  IndexedMessageDto,
  IndexedResourceDto,
} from './dto/indexed-doc.dto';
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

const TASK_PRIORITY = 4;
const BACKFILL_PAGE_SIZE = 100;
const WEAVIATE_SYNC_LOG_EVERY = 1000;

type WeaviateSyncStats = {
  scanned: number;
  synced: number;
  skipped: number;
  failed: number;
};

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
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    private readonly wizardTaskService: WizardTaskService,
    private readonly i18n: I18nService,
    private readonly tagService: TagService,
  ) {}

  async search(
    userId: string,
    namespaceId: string,
    query: string,
    type?: DocType,
  ) {
    const hasAccess = await this.permissionsService.userInNamespace(
      userId,
      namespaceId,
    );
    if (!hasAccess) {
      const message = this.i18n.t('auth.errors.notAuthorized');
      throw new AppException(message, 'NOT_AUTHORIZED', HttpStatus.FORBIDDEN);
    }
    const searchRequest = new SearchRequestDto();
    searchRequest.query = query;
    searchRequest.namespaceId = namespaceId;
    searchRequest.userId = userId;
    searchRequest.limit = 100;
    if (type === DocType.RESOURCE) {
      searchRequest.type = IndexRecordType.CHUNK;
    }
    if (type === DocType.MESSAGE) {
      searchRequest.type = IndexRecordType.MESSAGE;
    }
    const result = await this.wizardApiService.search(searchRequest);
    const items: IndexedDocDto[] = [];
    const seenResourceIds = new Set<string>();
    const seenConversationIds = new Set<string>();
    for (const record of result?.records || []) {
      if (record.type === IndexRecordType.CHUNK) {
        const chunk = record.chunk!;
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

    for (const record of result?.records || []) {
      if (record.type === IndexRecordType.CHUNK) {
        const chunk = record.chunk!;
        if (seenResourceIds.has(chunk.resourceId)) {
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
      } else if (record.type === IndexRecordType.MESSAGE) {
        const message = record.message!;
        if (seenConversationIds.has(message.conversationId)) {
          continue;
        }
        seenConversationIds.add(message.conversationId);
        if (!(await this.conversationsService.has(message.conversationId))) {
          continue;
        }
        const messageDto: IndexedMessageDto = {
          type: DocType.MESSAGE,
          id: record.id,
          conversationId: message.conversationId,
          content: message.message.content,
        };
        items.push(messageDto);
      }
    }
    return items;
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
  ): Promise<WeaviateSyncStats> {
    const stats: WeaviateSyncStats = {
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
        if (!this.shouldSyncResource(resource)) {
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
  ): Promise<WeaviateSyncStats> {
    const stats: WeaviateSyncStats = {
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
          if (!this.shouldSyncMessage(message)) {
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

  async syncWeaviateBackfill(concurrency: number) {
    const resources = await this.syncResourcesToWeaviate(concurrency);
    const messages = await this.syncMessagesToWeaviate(concurrency);
    return { resources, messages };
  }

  private shouldSyncResource(resource: Resource): boolean {
    if (resource.resourceType === ResourceType.FOLDER) {
      return false;
    }
    if (!resource.parentId) {
      return false;
    }
    return true;
  }

  private shouldSyncMessage(message: Message): boolean {
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
