import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Conversation } from 'src/conversations/entities/conversation.entity';
import { User } from 'src/user/user.entity';
import { Base } from 'src/common/base.entity';

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
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Conversation, (conversation) => conversation.messages)
  @JoinColumn({ name: 'conversation_id' })
  conversation: Conversation;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column('uuid', { name: 'parent_id', nullable: true })
  parentId?: string;

  /**
   * OpenAI format message
   */
  @Column('jsonb', { nullable: false })
  message: OpenAIMessage;

  @Column({
    type: 'enum',
    enum: MessageStatus,
    default: MessageStatus.PENDING,
  })
  status: MessageStatus;

  @Column('jsonb', { nullable: true })
  attrs?: MessageAttrs;
}
