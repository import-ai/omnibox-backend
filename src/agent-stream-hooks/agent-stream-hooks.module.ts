import { Global, Module } from '@nestjs/common';
import {
  AGENT_STREAM_HOOKS,
  IAgentStreamHooks,
} from 'omniboxd/agent-stream-hooks/agent-stream-hooks.interface';

/** No stream bookkeeping by default; deployments that need it bind their own. */
const noopAgentStreamHooks: IAgentStreamHooks = {
  onCallCompleted: () => Promise.resolve(),
  onStreamClosed: () => Promise.resolve(),
};

@Global()
@Module({
  providers: [
    {
      provide: AGENT_STREAM_HOOKS,
      useValue: noopAgentStreamHooks,
    },
  ],
  exports: [AGENT_STREAM_HOOKS],
})
export class AgentStreamHooksModule {}
