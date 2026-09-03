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
 * binds a no-op; backend-pro binds this to its credits ledger. Keyed by the
 * stream key (see wizard/stream-key.ts), which is also what the reservation
 * made when the stream was routed is keyed on.
 */
export interface IAgentTurnSettler {
  /** Charge one LLM call's tokens to the stream's open reservation. */
  record(
    namespaceId: string,
    streamId: string,
    usage: AgentTokenUsage,
  ): Promise<void>;

  /** Close the stream's reservation; a no-op when none is open. */
  settle(namespaceId: string, streamId: string): Promise<void>;
}
