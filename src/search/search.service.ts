import { Injectable } from '@nestjs/common';
import { DocType } from './doc-type.enum';
import {
  IndexedDocDto,
  IndexedMessageDto,
  IndexedResourceDto,
} from './dto/indexed-doc.dto';
import { PermissionsService } from 'src/permissions/permissions.service';
import { ResourcePermission } from 'src/permissions/resource-permission.enum';
import { WizardAPIService } from 'src/wizard/api.wizard.service';
import { SearchRequestDto } from 'src/wizard/dto/search-request.dto';
import { IndexRecordType } from 'src/wizard/dto/index-record.dto';
import { ConfigService } from '@nestjs/config';
import { ResourcesService } from 'src/resources/resources.service';
import { Repository } from 'typeorm';
import { Task } from 'src/tasks/tasks.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Index } from 'src/resources/wizard-task/index.service';
import { MessagesService } from 'src/messages/messages.service';
import { ConversationsService } from 'src/conversations/conversations.service';

const TASK_PRIORITY = 4;

@Injectable()
export class SearchService {
  private readonly wizardApiService: WizardAPIService;

  constructor(
    private readonly permissionsService: PermissionsService,
    private readonly resourcesService: ResourcesService,
    private readonly messagesService: MessagesService,
    private readonly conversationsService: ConversationsService,
    private readonly configService: ConfigService,
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
  ) {
    const baseUrl = this.configService.get<string>('OBB_WIZARD_BASE_URL');
    if (!baseUrl) {
      throw new Error('Environment variable OBB_WIZARD_BASE_URL is required');
    }
    this.wizardApiService = new WizardAPIService(baseUrl);
  }

  async search(
    namespaceId: string,
    query: string,
    type?: DocType,
    userId?: string,
  ) {
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
    for (const record of result.records) {
      if (record.type === IndexRecordType.CHUNK) {
        const chunk = record.chunk!;
        if (seenResourceIds.has(chunk.resourceId)) {
          continue;
        }
        seenResourceIds.add(chunk.resourceId);
        if (userId) {
          const hasPermission = await this.permissionsService.userHasPermission(
            namespaceId,
            chunk.resourceId,
            userId,
            ResourcePermission.CAN_VIEW,
          );
          if (!hasPermission) {
            continue;
          }
        }
        const resourceDto: IndexedResourceDto = {
          type: DocType.RESOURCE,
          id: record.id,
          resourceId: chunk.resourceId,
          title: chunk.title || 'Untitled',
          content: chunk.text || '',
        };
        items.push(resourceDto);
      } else if (record.type === IndexRecordType.MESSAGE) {
        const message = record.message!;
        if (seenConversationIds.has(message.conversationId)) {
          continue;
        }
        seenConversationIds.add(message.conversationId);
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
      const resources = await this.resourcesService.listAllResources(
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
        await Index.upsert(
          TASK_PRIORITY,
          resource.userId,
          resource,
          this.taskRepository,
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
        const messages = await this.messagesService.findAll(
          conversation.userId,
          conversation.id,
        );
        for (const message of messages) {
          await Index.upsertMessageIndex(
            TASK_PRIORITY,
            conversation.userId,
            conversation.namespaceId,
            conversation.id,
            message,
            this.taskRepository,
          );
        }
      }
    }
  }
}
