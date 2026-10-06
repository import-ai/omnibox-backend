import { Base } from 'omniboxd/common/base.entity';
import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  ValueTransformer,
} from 'typeorm';

/** Token counts fit a JS number; TypeORM hands bigint back as a string. */
const bigIntCount: ValueTransformer = {
  to: (value: number) => value,
  from: (value: string | null) => (value === null ? 0 : Number(value)),
};

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
  client_request_id?: string;
  citations?: Record<string, any>[];
  error_message?: string;
  context?: Record<string, any>;
  compact?: {
    status: 'compacting' | 'compacted';
  };
  user_context?: Record<string, any>;
  // What the sender picked for this turn: the tools (each private_search tool
  // carrying its resources) and the composer's rendered parts.
  tools?: Record<string, any>[];
  composer?: Record<string, any>;
  tool_call?: Record<string, any>;
  usage?: Record<string, any>;
  stream_event_id?: string;
}

@Entity('messages')
export class Message extends Base {
  @PrimaryGeneratedColumn()
  id: string;

  @Column('varchar', { nullable: true })
  userId: string | null;

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

  /**
   * Tokens burned by the LLM call that produced this message, split the way
   * agent credits are priced. Accumulated from the wizard's usage deltas as
   * the message streams; `attrs.usage` keeps only the last block, since delta
   * attrs are merged with an overwrite.
   */
  @Column('bigint', { default: 0, transformer: bigIntCount })
  inputTokenUncached: number;

  @Column('bigint', { default: 0, transformer: bigIntCount })
  inputTokenCached: number;

  @Column('bigint', { default: 0, transformer: bigIntCount })
  outputToken: number;
}

/** Only successful answers at a user-turn boundary belong in the index. */
export function isMessageIndexable(
  message: Message,
  children: Message[],
): boolean {
  if (!message.userId || message.deletedAt || !message.message.content?.trim())
    return false;
  if (message.message.role === OpenAIMessageRole.USER) return true;
  if (
    message.message.role !== OpenAIMessageRole.ASSISTANT ||
    message.status !== MessageStatus.SUCCESS ||
    message.message.tool_calls?.length ||
    message.attrs?.tool_call?.interrupts?.length
  )
    return false;
  const activeChildren = children.filter(
    (child) =>
      !child.deletedAt &&
      child.conversationId === message.conversationId &&
      child.parentId === message.id,
  );
  return (
    !activeChildren.length ||
    activeChildren.some(
      (child) =>
        child.message.role === OpenAIMessageRole.USER &&
        !child.attrs?.tool_call?.decisions?.length,
    )
  );
}

export function childrenByMessage(messages: Message[]): Map<string, Message[]> {
  const children = new Map<string, Message[]>();
  for (const message of messages) {
    if (!message.deletedAt && message.parentId) {
      const siblings = children.get(message.parentId) || [];
      siblings.push(message);
      children.set(message.parentId, siblings);
    }
  }
  return children;
}
