import { AsyncLocalStorage } from 'node:async_hooks';
export interface BehaviorContext {
  action_id: string;
  action_type: string;
  action_started_at: string;
  origin_platform: string;
  user_id: string;
  task_ids: string[];
  changed?: boolean;
  /** The same frozen action id resumed after a failed request. */
  reopened?: boolean;
}
export const behaviorContext = new AsyncLocalStorage<BehaviorContext>();
