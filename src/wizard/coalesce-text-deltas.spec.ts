import { coalesceTextDeltas } from './coalesce-text-deltas';
it('merges buffered text without crossing message, metadata or reasoning boundaries', () => {
  const frame = (message: object, attrs?: object) =>
    JSON.stringify({ response_type: 'delta', message, attrs });
  const eos = JSON.stringify({ response_type: 'eos' });
  const tool = frame({ content: 'ok', tool_call_id: 'tool' });
  const usage = frame({}, { usage: { tokens: 1 } });
  expect(
    coalesceTextDeltas([
      frame({ content: 'a' }),
      frame({ content: 'b' }),
      eos,
      frame({ reasoning_content: 'c' }),
      frame({ content: 'd' }),
      tool,
      usage,
    ]),
  ).toEqual([
    frame({ content: 'ab' }),
    eos,
    frame({ reasoning_content: 'c' }),
    frame({ content: 'd' }),
    tool,
    usage,
  ]);
});
