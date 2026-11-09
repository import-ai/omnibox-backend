import { randomUUID } from 'crypto';

import { Message, MessageStatus } from './entities/message.entity';

export interface AnswerTiming {
  version: 1;
  answer_id: string;
  run_id: string;
  status: 'running' | 'paused' | 'complete' | 'stopped' | 'failed';
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
}

export interface AnswerTimingRun {
  value: AnswerTiming;
  previousDurationMs?: number;
  startedAtMonotonic: number;
}

export function startAnswerTiming(
  runId: string,
  ancestors: Message[],
  isToolDecision: boolean,
  now = new Date(),
  monotonic = performance.now(),
  answerId = randomUUID(),
): AnswerTimingRun {
  const query = ancestors.at(-1);
  const parent = ancestors.find((message) => message.id === query?.parentId);
  const timing = parent?.attrs?.answer_timing;
  const continues =
    isToolDecision &&
    query?.attrs?.tool_call?.decisions?.length &&
    parent?.status === MessageStatus.SUCCESS &&
    parent.attrs?.tool_call?.interrupts?.length &&
    timing?.version === 1 &&
    timing.status === 'paused' &&
    Boolean(timing.answer_id && timing.run_id) &&
    Number.isFinite(Date.parse(timing.started_at));
  return {
    value: {
      version: 1,
      answer_id: continues ? timing.answer_id : answerId,
      run_id: runId,
      status: 'running',
      started_at: continues ? timing.started_at : now.toISOString(),
    },
    previousDurationMs: isToolDecision
      ? continues &&
        Number.isSafeInteger(timing.duration_ms) &&
        timing.duration_ms! >= 0
        ? timing.duration_ms
        : undefined
      : 0,
    startedAtMonotonic: monotonic,
  };
}

export function finishAnswerTiming(
  run: AnswerTimingRun,
  status: 'paused' | 'complete',
  endedAt: Date,
  endedAtMonotonic: number,
): AnswerTiming {
  const elapsed = endedAtMonotonic - run.startedAtMonotonic;
  const duration =
    run.previousDurationMs === undefined
      ? NaN
      : run.previousDurationMs + Math.round(elapsed);
  return {
    ...run.value,
    status,
    ...(status === 'complete' ? { completed_at: endedAt.toISOString() } : {}),
    ...(elapsed >= 0 && Number.isSafeInteger(duration) && duration >= 0
      ? { duration_ms: duration }
      : {}),
  };
}

/** Stopped and failed runs have an outcome, never a completed-answer duration. */
export function endAnswerTiming(
  value: AnswerTiming,
  status: 'stopped' | 'failed',
  endedAt = new Date(),
): AnswerTiming {
  return {
    version: 1,
    answer_id: value.answer_id,
    run_id: value.run_id,
    started_at: value.started_at,
    status,
    completed_at: endedAt.toISOString(),
  };
}
