import { finishAnswerTiming, startAnswerTiming } from './answer-timing';
import {
  Message,
  MessageStatus,
  OpenAIMessageRole,
} from './entities/message.entity';

const now = new Date('2026-11-09T03:00:00Z');
const paused = {
  version: 1 as const,
  answer_id: 'answer',
  run_id: 'old',
  status: 'paused' as const,
  started_at: '2026-11-09T02:00:00Z',
  duration_ms: 2000,
};
const parent = {
  id: 'tool',
  status: MessageStatus.SUCCESS,
  attrs: { answer_timing: paused, tool_call: { interrupts: [{}] } },
  message: { role: OpenAIMessageRole.TOOL },
} as unknown as Message;
const query = {
  id: 'decision',
  parentId: 'tool',
  message: { role: OpenAIMessageRole.USER },
  attrs: { tool_call: { decisions: [{}] } },
} as unknown as Message;

describe('answer timing segments', () => {
  it('measures a fresh run with a monotonic clock', () => {
    const run = startAnswerTiming('new', [], false, now, 100);
    expect(finishAnswerTiming(run, 'complete', now, 1350)).toMatchObject({
      answer_id: run.value.answer_id,
      duration_ms: 1250,
      status: 'complete',
    });
  });
  it('continues only its own interrupted parent and excludes approval waiting', () => {
    const run = startAnswerTiming('new', [parent, query], true, now, 100);
    expect(finishAnswerTiming(run, 'complete', now, 600)).toMatchObject({
      answer_id: 'answer',
      run_id: 'new',
      duration_ms: 2500,
      started_at: paused.started_at,
    });
    const fresh = startAnswerTiming(
      'retry',
      [parent, { ...query, parentId: 'other' }],
      true,
      now,
      100,
    );
    expect(fresh.value.answer_id).not.toBe('answer');
    expect(
      finishAnswerTiming(fresh, 'complete', now, 600).duration_ms,
    ).toBeUndefined();
    expect(
      startAnswerTiming('regen', [parent, query], false, now, 100).value
        .answer_id,
    ).not.toBe('answer');
  });
  it.each([undefined, -1, NaN, Number.MAX_SAFE_INTEGER])(
    'keeps missing or invalid inherited durations unavailable (%s)',
    (duration_ms) => {
      const ancestor = {
        ...parent,
        attrs: { ...parent.attrs, answer_timing: { ...paused, duration_ms } },
      } as unknown as Message;
      const run = startAnswerTiming('new', [ancestor, query], true, now, 100);
      expect(
        finishAnswerTiming(run, 'complete', now, 600).duration_ms,
      ).toBeUndefined();
    },
  );
});

describe('shared answer identity', () => {
  it('does not reuse a caller request ID as the logical answer identity', () => {
    const a = startAnswerTiming('same-caller-run', [], false, now, 1);
    const b = startAnswerTiming('same-caller-run', [], false, now, 1);
    expect(a.value.answer_id).not.toBe('same-caller-run');
    expect(a.value.answer_id).not.toBe(b.value.answer_id);
  });
});
