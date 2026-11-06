import { beginAnswerTiming, finishAnswerTiming } from './answer-timing';
import { Message, OpenAIMessageRole as R } from './entities/message.entity';

const start = Date.parse('2026-11-05T02:00:00.000Z');
const query = { id: 'query', message: { role: R.USER } } as Message;

test('counts generation and tools but excludes approval waiting', () => {
  const paused = finishAnswerTiming(
    beginAnswerTiming('first', [query], start),
    'paused',
    start + 5000,
  );
  const messages = [
    query,
    {
      id: 'approval',
      parentId: query.id,
      message: { role: R.ASSISTANT },
      attrs: { answer_timing: paused, tool_call: { interrupts: [{}] } },
    },
    {
      id: 'decision',
      parentId: 'approval',
      message: { role: R.USER },
      attrs: { tool_call: { decisions: [{ type: 'approve' }] } },
    },
  ] as Message[];
  const resumed = beginAnswerTiming('second', messages, start + 65000);
  const completed = finishAnswerTiming(resumed, 'success', start + 68000);
  expect(completed.duration_ms).toBe(8000);
  expect(completed.answer_id).toBe('first');
  expect(completed.run_id).toBe('second');
});

test('regeneration of the same question starts an independent duration', () => {
  const first = finishAnswerTiming(
    beginAnswerTiming('first', [query], start),
    'success',
    start + 5000,
  );
  const second = finishAnswerTiming(
    beginAnswerTiming('second', [query], start + 65000),
    'success',
    start + 68000,
  );
  expect(first.duration_ms).toBe(5000);
  expect(second.duration_ms).toBe(3000);
  expect(second.answer_id).toBe('second');
});

test('a resumed old answer without reliable prior timing stays unknown', () => {
  const messages = [
    query,
    { id: 'old', message: { role: R.ASSISTANT } },
    {
      id: 'decision',
      parentId: 'old',
      message: { role: R.USER },
      attrs: { tool_call: { decisions: [{}] } },
    },
  ] as Message[];
  expect(
    finishAnswerTiming(
      beginAnswerTiming('resume', messages, start),
      'success',
      start + 3000,
    ).duration_ms,
  ).toBeNull();
});

test('finalized duration is immutable on replay and late completion', () => {
  const stopped = finishAnswerTiming(
    beginAnswerTiming('run', [query], start),
    'stopped',
    start + 1234,
  );
  expect(finishAnswerTiming(stopped, 'success', start + 9000)).toBe(stopped);
});

test('invalid clocks do not produce a negative or invented duration', () => {
  expect(
    finishAnswerTiming(
      beginAnswerTiming('run', [query], start),
      'success',
      start - 1,
    ).duration_ms,
  ).toBeNull();
});
