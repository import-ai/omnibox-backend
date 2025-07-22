import { Base } from 'omnibox-backend/common/base.entity';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Every message has a `parentId` that points to its preceding message.
 * This structure supports two main scenarios:
 *
 * 1. **Regenerating the LLM’s response**
 *     - Retrying a failed or incomplete response
 *     - Replacing a response that was inaccurate or irrelevant
 * 2. **Editing the user’s query message**
 */

export enum MessageStatus {
  PENDING = 'pending',
  STREAMING = 'streaming',
  SUCCESS = 'success',
  STOPPED = 'stopped',
  INTERRUPTED = 'interrupted',
  FAILED = 'failed',
}

export enum OpenAIMessageRole {
  SYSTEM = 'system',
  USER = 'user',
  ASSISTANT = 'assistant',
  TOOL = 'tool',
}

export interface OpenAIMessage {
  role: OpenAIMessageRole;
  content?: string;
  reasoning_content?: string;
  tool_calls?: Record<string, any>[];
  tool_call_id?: string;
}

export interface MessageAttrs {
  citations?: Record<string, any>[];
}

@Entity('messages')
export class Message extends Base {
  @PrimaryGeneratedColumn()
  id: string;

  @Column()
  userId: string;

  @Column()
  conversationId: string;

  @Column('uuid', { nullable: true })
  parentId: string | null;

  @Column('enum', {
    enum: MessageStatus,
    default: MessageStatus.PENDING,
  })
  status: MessageStatus;

  /**
   * OpenAI format message
   */
  @Column('jsonb')
  message: OpenAIMessage;

  @Column('jsonb', { nullable: true })
  attrs: MessageAttrs | null;
}
