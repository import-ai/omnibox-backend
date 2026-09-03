import { Global, Module } from '@nestjs/common';
import {
  AGENT_TURN_SETTLER,
  IAgentTurnSettler,
} from 'omniboxd/agent-turn-settler/agent-turn-settler.interface';

/** Core meters nothing; only the pro wizard consumes agent credits. */
const noopAgentTurnSettler: IAgentTurnSettler = {
  record: () => Promise.resolve(),
  settle: () => Promise.resolve(),
};

@Global()
@Module({
  providers: [
    {
      provide: AGENT_TURN_SETTLER,
      useValue: noopAgentTurnSettler,
    },
  ],
  exports: [AGENT_TURN_SETTLER],
})
export class AgentTurnSettlerModule {}
