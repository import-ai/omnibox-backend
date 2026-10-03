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
  turn_completed?: { query_id: string; completed_at: string };
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

/** Assistant eligibility requires durable evidence of a completed turn. */
export function isMessageIndexable(message: Message): boolean {
  return (
    !!message.userId &&
    !!message.message.content?.trim() &&
    (message.message.role === OpenAIMessageRole.USER ||
      (message.message.role === OpenAIMessageRole.ASSISTANT &&
        message.status === MessageStatus.SUCCESS &&
        !!message.attrs?.turn_completed))
  );
}
