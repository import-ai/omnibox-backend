import type { Message } from './entities/message.entity';

export interface AnswerTiming {
  version: 1;
  answer_id: string;
  run_id: string;
  started_at: string;
  ended_at?: string;
  previous_duration_ms: number | null;
  duration_ms?: number | null;
  outcome: 'running' | 'paused' | 'success' | 'failed' | 'stopped';
}

/** Only an explicit tool decision continues a previous answer's clock. */
export function beginAnswerTiming(
  runId: string,
  messages: Message[],
  now = Date.now(),
): AnswerTiming {
  const query = messages.at(-1);
  const decision = !!query?.attrs?.tool_call?.decisions?.length;
  const parent = decision
    ? messages.find((message) => message.id === query?.parentId)
    : undefined;
  const previous = parent?.attrs?.answer_timing;
  const canContinue =
    previous?.version === 1 &&
    previous.outcome === 'paused' &&
    typeof previous.duration_ms === 'number' &&
    Number.isSafeInteger(previous.duration_ms) &&
    previous.duration_ms >= 0;
  return {
    version: 1,
    answer_id: canContinue ? previous.answer_id : runId,
    run_id: runId,
    started_at: new Date(now).toISOString(),
    previous_duration_ms: decision
      ? canContinue
        ? previous.duration_ms!
        : null
      : 0,
    outcome: 'running',
  };
}

/** Terminal snapshots are immutable, so replay never adds elapsed time. */
export function finishAnswerTiming(
  timing: AnswerTiming,
  outcome: Exclude<AnswerTiming['outcome'], 'running'>,
  now = Date.now(),
): AnswerTiming {
  if (timing.outcome !== 'running') return timing;
  const elapsed = now - Date.parse(timing.started_at);
  const end = new Date(now);
  const total =
    timing.previous_duration_ms === null
      ? NaN
      : timing.previous_duration_ms + elapsed;
  return {
    ...timing,
    ...(!Number.isNaN(end.getTime()) ? { ended_at: end.toISOString() } : {}),
    duration_ms:
      elapsed >= 0 && Number.isSafeInteger(total) && total >= 0 ? total : null,
    outcome,
  };
}
