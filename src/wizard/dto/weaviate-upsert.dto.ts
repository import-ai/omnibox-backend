export interface UpsertWeaviateResourceRequestDto {
  namespaceId: string;
  title: string;
  content: string;
  resourceId: string;
  parentId: string;
  resourceTagIds: string[];
  resourceTagNames: string[];
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
