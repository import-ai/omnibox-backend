export const AGENT_STREAM_HOOKS = Symbol('AGENT_STREAM_HOOKS');

/**
 * Tokens one LLM call consumed, split by how providers price them: input served
 * from the provider's context cache is charged far below uncached input, and
 * output — which includes the model's thinking tokens — far above both.
 */
export interface AgentTokenUsage {
  inputTokenCached: number;
  inputTokenUncached: number;
  outputToken: number;
}

/**
 * The chat stream a hook is being called for.
 *
 * `streamId` is the stream key (see wizard/stream-key.ts). `shareId` says how
 * the stream was opened, and is carried alongside rather than read back out of
 * the key: the key is an opaque identifier to everything but the function that
 * builds it.
 */
export interface AgentCreditPrice {
  input: number;
  input_cached: number;
  output: number;
}

export interface AgentStream {
  billing?: { edition: 'basic' | 'pro'; price?: AgentCreditPrice };
  namespaceId: string;
  streamId: string;
  /** Set when the stream was opened through a share link, not by a member. */
  shareId?: string;
}

/**
 * Lifecycle hooks on an agent chat stream, for work that hangs off a stream
 * without belonging to it — usage accounting, auditing, quota bookkeeping.
 *
 * Nothing is bound by default; a deployment that needs these events provides
 * its own implementation. Completion hooks run fire-and-forget and log errors;
 * startup and explicit cancellation hooks are awaited and may reject.
 */
export interface IAgentStreamHooks {
  /** Return false when a deployment wants to index only after the whole turn. */
  shouldIndexCall?(stream: AgentStream): boolean;

  /** Complete deployment-specific cancellation before stopping the stream, including on another instance. */
  onCancellationRequested?(
    userId: string,
    conversationId: string,
  ): Promise<void>;
  /** Read trusted upstream billing metadata before consuming any events. */
  onStreamStarted?(
    stream: AgentStream,
    response: Response,
  ): void | Promise<void>;
  /**
   * One LLM call finished, producing the message `messageId` and consuming
   * `usage`. Called once per completed call, and the message id is stable, so
   * an implementation can make repeated delivery a no-op.
   */
  onCallCompleted(
    stream: AgentStream,
    messageId: string,
    usage: AgentTokenUsage,
  ): Promise<void>;

  /** Successful end of a whole agent turn, after the final assistant message. */
  onStreamCompleted?(
    stream: AgentStream,
    conversationId: string,
    messageId: string,
  ): Promise<void>;

  /**
   * The stream ended. The single funnel for every ending — completion, error,
   * cancellation and abort alike — so it is the place to release whatever the
   * stream was holding.
   */
  onStreamClosed(stream: AgentStream): Promise<void>;
}
