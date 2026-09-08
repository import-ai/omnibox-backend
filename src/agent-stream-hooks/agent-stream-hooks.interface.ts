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
export interface AgentStream {
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
 * its own implementation. Hooks are invoked fire-and-forget, so they must not
 * assume their result is awaited, and anything they throw is logged rather
 * than surfaced to the user whose stream triggered them.
 */
export interface IAgentStreamHooks {
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

  /**
   * The stream ended. The single funnel for every ending — completion, error,
   * cancellation and abort alike — so it is the place to release whatever the
   * stream was holding.
   */
  onStreamClosed(stream: AgentStream): Promise<void>;
}
