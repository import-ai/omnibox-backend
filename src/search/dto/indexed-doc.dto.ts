import { DocType } from '../doc-type.enum';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';

export class IndexedResourceDto {
  type: DocType.RESOURCE;
  id: string;
  resourceId: string;
  title: string;
  content: string;
  attrs: Record<string, any>;
  resourceType: ResourceType;
}

export class IndexedMessageDto {
  type: DocType.MESSAGE;
  id: string;
  conversationId: string;
  content: string;
}

export type IndexedDocDto = IndexedResourceDto | IndexedMessageDto;
