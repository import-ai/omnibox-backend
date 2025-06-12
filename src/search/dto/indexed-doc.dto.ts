import { DocType } from '../doc-type.enum';

export class IndexedResourceDto {
  type: DocType.RESOURCE;
  id: string;
  resourceId: string;
  title: string;
  content: string;
}

export class IndexedMessageDto {
  type: DocType.MESSAGE;
  id: string;
  conversationId: string;
  content: string;
}

export type IndexedDocDto = IndexedResourceDto | IndexedMessageDto;
