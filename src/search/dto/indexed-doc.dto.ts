import { DocType } from '../doc-type.enum';

export class IndexedResourceDto {
  type: DocType.RESOURCE;
  id: string;
  namespaceId: string;
  name: string;
  content: string;
  _vectors?: {
    omniboxEmbed: {
      embeddings: number[];
      regenerate: boolean;
    };
  };
}

export class IndexedMessageDto {
  type: DocType.MESSAGE;
  id: string;
  namespaceId: string;
  userId: string;
  conversationId: string;
  content: string;
  _vectors?: {
    omniboxEmbed: {
      embeddings: number[];
      regenerate: boolean;
    };
  };
}

export type IndexedDocDto = IndexedResourceDto | IndexedMessageDto;
