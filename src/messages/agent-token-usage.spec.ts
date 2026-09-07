import { agentTokenDeltaOf } from 'omniboxd/messages/agent-token-usage';

describe('agentTokenDeltaOf', () => {
  it('splits the prompt total into its cached and uncached parts', () => {
    expect(
      agentTokenDeltaOf({
        usage: {
          prompt_tokens: 12194,
          completion_tokens: 15,
          total_tokens: 12209,
          prompt_tokens_details: { cached_tokens: 12032 },
          context_compact: { estimated_tokens: 83, trigger_tokens: 100000 },
        },
      }),
    ).toEqual({
      inputTokenCached: 12032,
      inputTokenUncached: 162,
      outputToken: 15,
    });
  });

  it('treats a missing cached breakdown as fully uncached', () => {
    expect(
      agentTokenDeltaOf({
        usage: { prompt_tokens: 100, completion_tokens: 5 },
      }),
    ).toEqual({
      inputTokenCached: 0,
      inputTokenUncached: 100,
      outputToken: 5,
    });
  });

  it('never reports a negative uncached count', () => {
    expect(
      agentTokenDeltaOf({
        usage: {
          prompt_tokens: 10,
          prompt_tokens_details: { cached_tokens: 25 },
        },
      }),
    ).toEqual({
      inputTokenCached: 25,
      inputTokenUncached: 0,
      outputToken: 0,
    });
  });

  it('ignores attrs that carry no usage block', () => {
    expect(agentTokenDeltaOf(undefined)).toBeNull();
    expect(agentTokenDeltaOf(null)).toBeNull();
    expect(agentTokenDeltaOf({ citations: [] })).toBeNull();
    expect(
      agentTokenDeltaOf({ usage: { context_compact: { trigger_tokens: 1 } } }),
    ).toBeNull();
  });
});
