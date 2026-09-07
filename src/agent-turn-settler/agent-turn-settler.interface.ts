export const AGENT_TURN_SETTLER = Symbol('AGENT_TURN_SETTLER');

/**
 * Token usage of one LLM call, split the way agent credits are priced:
 * cached input is billed far below uncached input, output far above.
 */
export interface AgentTokenUsage {
  inputTokenCached: number;
  inputTokenUncached: number;
  outputToken: number;
}

/**
 * Meters agent-credit consumption for wizard chat streams. The core deployment
 * binds a no-op; backend-pro binds this to its agent-credit accounting.
 *
 * Streams are identified by the stream key (see wizard/stream-key.ts), which is
 * also what the reservation made when the stream was routed is keyed on. A
 * charge is keyed on the message the call produced, so it can be recorded at
 * most once however often the same call is reported.
 */
export interface IAgentTurnSettler {
  /** Charge one LLM call's tokens to the message that the call produced. */
  record(
    namespaceId: string,
    streamId: string,
    messageId: string,
    usage: AgentTokenUsage,
  ): Promise<void>;

  /** Release the stream's reservation; a no-op when none is open. */
  settle(namespaceId: string, streamId: string): Promise<void>;
}
