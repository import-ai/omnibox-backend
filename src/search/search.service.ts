import { Injectable } from '@nestjs/common';
import { DocType } from './doc-type.enum';
import {
  IndexedDocDto,
  IndexedMessageDto,
  IndexedResourceDto,
} from './dto/indexed-doc.dto';
import { PermissionsService } from 'src/permissions/permissions.service';
import { PermissionLevel } from 'src/permissions/permission-level.enum';
import { WizardAPIService } from 'src/wizard/api.wizard.service';
import { SearchRequestDto } from 'src/wizard/dto/search-request.dto';
import { IndexRecordType } from 'src/wizard/dto/index-record.dto';

@Injectable()
export class SearchService {
  constructor(
    private readonly permissionsService: PermissionsService,
    private readonly wizardService: WizardAPIService,
  ) {}

  async search(
    namespaceId: string,
    query: string,
    type?: DocType,
    userId?: string,
  ) {
    const searchRequest: SearchRequestDto = {
      query,
      namespaceId,
      userId,
      limit: 100,
    };
    if (type === DocType.RESOURCE) {
      searchRequest.type = IndexRecordType.CHUNK;
    }
    if (type === DocType.MESSAGE) {
      searchRequest.type = IndexRecordType.MESSAGE;
    }
    const result = await this.wizardService.search(searchRequest);
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
            PermissionLevel.CAN_VIEW,
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
}
