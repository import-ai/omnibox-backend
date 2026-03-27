export interface WeaviateResourceMetaInfoDto {
  resourceId: string;
  parentId: string;
}

export interface UpsertWeaviateResourceRequestDto {
  namespaceId: string;
  title: string;
  content: string;
  metaInfo: WeaviateResourceMetaInfoDto;
}

export interface WeaviateOpenAIMessageDto {
  role: string;
  content: string;
}

export interface WeaviateMessageDto {
  conversationId: string;
  messageId: string;
  message: WeaviateOpenAIMessageDto;
}

export interface UpsertWeaviateMessageRequestDto {
  namespaceId: string;
  userId: string;
  message: WeaviateMessageDto;
}

export interface WeaviateUpsertResponseDto {
  success: boolean;
  error?: string;
}
