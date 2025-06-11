import { Expose, Type } from 'class-transformer';

export enum ChunkType {
  TITLE = 'title',
  DOC = 'doc',
  SNIPPET = 'snippet',
  KEYWORD = 'keyword',
}

export class ChunkDto {
  @Expose({ name: 'title' })
  title?: string | null;

  @Expose({ name: 'resource_id' })
  resourceId: string;

  @Expose({ name: 'text' })
  text?: string | null;

  @Expose({ name: 'chunk_type' })
  chunkType: ChunkType;

  @Expose({ name: 'user_id' })
  userId: string;

  @Expose({ name: 'parent_id' })
  parentId: string;

  @Expose({ name: 'chunk_id' })
  chunkId: string;

  @Expose({ name: 'created_at' })
  createdAt: Date;

  @Expose({ name: 'updated_at' })
  updatedAt: Date;

  @Expose({ name: 'start_index' })
  startIndex?: number | null;

  @Expose({ name: 'end_index' })
  endIndex?: number | null;
}

export class OpenAIMessageDto {
  @Expose({ name: 'role' })
  role: string;

  @Expose({ name: 'content' })
  content: string;
}

export class MessageDto {
  @Expose({ name: 'conversation_id' })
  conversationId: string;

  @Expose({ name: 'message_id' })
  messageId: string;

  @Expose({ name: 'message' })
  @Type(() => OpenAIMessageDto)
  message: OpenAIMessageDto;
}

export enum IndexRecordType {
  CHUNK = 'chunk',
  MESSAGE = 'message',
}

export class IndexRecordDto {
  @Expose({ name: 'id' })
  id: string;

  @Expose({ name: 'type' })
  type: IndexRecordType;

  @Expose({ name: 'namespace_id' })
  namespaceId: string;

  @Expose({ name: 'user_id' })
  userId?: string | null;

  @Expose({ name: 'chunk' })
  @Type(() => ChunkDto)
  chunk?: ChunkDto | null;

  @Expose({ name: 'message' })
  @Type(() => MessageDto)
  message?: MessageDto | null;
}
