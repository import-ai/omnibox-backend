import { AgentTokenUsage } from 'omniboxd/agent-turn-settler/agent-turn-settler.interface';
import { MessageAttrs } from 'omniboxd/messages/entities/message.entity';

const count = (value: unknown): number => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * Tokens reported by one wizard usage delta, split the way agent credits are
 * priced. The provider reports `prompt_tokens` as the whole input with
 * `cached_tokens` a subset of it, so the two are derived rather than read
 * separately. `usage.context_compact` rides along in the same object but is
 * wizard-injected compaction config, not tokens.
 */
export function agentTokenDeltaOf(
  attrs?: MessageAttrs | null,
): AgentTokenUsage | null {
  const usage = attrs?.usage;
  if (!usage || typeof usage.prompt_tokens !== 'number') {
    return null;
  }
  const inputTokenCached = count(usage.prompt_tokens_details?.cached_tokens);
  return {
    inputTokenCached,
    inputTokenUncached: Math.max(
      0,
      count(usage.prompt_tokens) - inputTokenCached,
    ),
    outputToken: count(usage.completion_tokens),
  };
}
