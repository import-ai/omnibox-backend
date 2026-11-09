import {
  Message,
  MessageStatus,
  OpenAIMessageRole,
} from 'omniboxd/messages/entities/message.entity';

import { StreamService } from './stream.service';

function fixture() {
  const rows = new Map<string, Message>();
  let sequence = 0;
  const messages = {
    create: jest.fn((_n, _c, _u, dto) => {
      const row = {
        ...dto,
        id: `m${++sequence}`,
        createdAt: new Date(),
        status: MessageStatus.PENDING,
        inputTokenCached: 0,
        inputTokenUncached: 0,
        outputToken: 0,
      } as Message;
      rows.set(row.id, row);
      return Promise.resolve(row);
    }),
    update: jest.fn((id, _n, _c, dto) =>
      Promise.resolve(Object.assign(rows.get(id)!, dto)),
    ),
    updateDelta: jest.fn((id, delta) => {
      const row = rows.get(id)!;
      row.message = { ...row.message, ...delta.message };
      row.attrs = { ...row.attrs, ...delta.attrs };
      return Promise.resolve(row);
    }),
    setAnswerTiming: jest.fn((id, timing) => {
      const row = rows.get(id)!;
      row.attrs = { ...row.attrs, answer_timing: timing } as any;
      return Promise.resolve(row);
    }),
    indexFinalAssistant: jest.fn(),
    findOne: jest.fn((id) => Promise.resolve(rows.get(id))),
  };
  const service = new StreamService(
    { get: jest.fn() } as any,
    {} as any,
    messages as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    { t: (k: string) => k } as any,
    {} as any,
    { onCallCompleted: jest.fn() } as any,
  );
  const sent: any[] = [];
  const handler = service.agentHandler('n', 'c', 'u', (data) => {
    sent.push(JSON.parse(data));
    return Promise.resolve();
  });
  const context: any = {
    runId: 'run',
    answerTiming: {
      value: {
        version: 1,
        answer_id: 'run',
        run_id: 'run',
        status: 'running',
        started_at: new Date().toISOString(),
      },
      previousDurationMs: 0,
      startedAtMonotonic: performance.now() - 1234,
    },
  };
  const emit = (chunk: any) => handler(JSON.stringify(chunk), context);
  return { service, messages, rows, sent, context, emit };
}

describe('answer timing stream lifecycle', () => {
  it('persists the final EOS duration before a metadata delta and DONE', async () => {
    const { emit, rows, messages, sent } = fixture();
    await emit({ response_type: 'bos', role: OpenAIMessageRole.ASSISTANT });
    await emit({
      response_type: 'delta',
      message: { reasoning_content: 'think', content: 'answer' },
    });
    await emit({ response_type: 'eos' });
    expect(messages.setAnswerTiming).not.toHaveBeenCalled();
    await emit({ response_type: 'done', event_id: '1-4' });
    const timing = (rows.get('m1')!.attrs as any).answer_timing;
    expect(timing).toMatchObject({
      status: 'complete',
      answer_id: 'run',
      run_id: 'run',
    });
    expect(timing.duration_ms).toBeGreaterThanOrEqual(1234);
    expect(sent.slice(-2)).toEqual([
      expect.objectContaining({
        response_type: 'delta',
        id: 'm1',
        message: {},
        attrs: { answer_timing: timing },
      }),
      { response_type: 'done' },
    ]);
    const saved = timing.duration_ms;
    await emit({ response_type: 'done' });
    expect((rows.get('m1')!.attrs as any).answer_timing.duration_ms).toBe(
      saved,
    );
    expect(messages.setAnswerTiming).toHaveBeenCalledTimes(1);
  });

  it('does not finalize intermediate tool calls or failed/missing-DONE runs', async () => {
    for (const failed of [false, true]) {
      const { emit, context, messages } = fixture();
      await emit({ response_type: 'bos', role: OpenAIMessageRole.ASSISTANT });
      await emit({
        response_type: 'delta',
        message: { tool_calls: [{ id: 'call' }] },
      });
      await emit({ response_type: 'eos' });
      expect(messages.setAnswerTiming).not.toHaveBeenCalled();
      context.failed = failed;
      await emit({ response_type: 'done' });
      expect(messages.setAnswerTiming).not.toHaveBeenCalled();
    }
  });

  it('stores paused tool timing but strips Wizard-owned timing attrs', async () => {
    const { emit, rows } = fixture();
    await emit({
      response_type: 'bos',
      role: OpenAIMessageRole.TOOL,
      attrs: { answer_timing: { status: 'complete', duration_ms: 999999 } },
    });
    await emit({
      response_type: 'delta',
      message: {},
      attrs: {
        tool_call: { interrupts: [{ id: 'approval' }] },
        answer_timing: { status: 'complete' },
      },
    });
    await emit({ response_type: 'eos' });
    await emit({ response_type: 'done' });
    expect((rows.get('m1')!.attrs as any).answer_timing).toMatchObject({
      status: 'paused',
      run_id: 'run',
    });
  });
});

describe('answer timing stream ordering', () => {
  it('assigns increasing Redis IDs around inserted completion metadata', async () => {
    const { service, context } = fixture();
    let sequence = 0;
    const ids: string[] = [];
    (service as any).redisClient = {
      isOpen: true,
      incr: jest.fn(() => Promise.resolve(++sequence)),
      expire: jest.fn(() => Promise.resolve(1)),
      sendCommand: jest.fn((args) => {
        ids.push(args[5]);
        return Promise.resolve();
      }),
    };
    const session: any = {
      key: 'session',
      finished: false,
      events: [],
      subscribers: new Set(),
    };
    const handler = service.agentHandler('n', 'c', 'u', (data) =>
      (service as any).sendSessionData(session, data),
    );
    for (const chunk of [
      { response_type: 'bos', role: OpenAIMessageRole.ASSISTANT },
      { response_type: 'delta', message: { content: 'answer' } },
      { response_type: 'eos' },
      { response_type: 'done' },
    ])
      await handler(
        await (service as any).addNextEventId(session, JSON.stringify(chunk)),
        context,
      );
    expect(ids).toHaveLength(5);
    const numbers = ids.map((id) => Number(id.split('-')[1]));
    expect(numbers.every((number, i) => !i || number > numbers[i - 1])).toBe(
      true,
    );
    expect(
      session.events.map((s: string) => JSON.parse(s).response_type),
    ).toEqual(['bos', 'delta', 'eos', 'delta', 'done']);
  });
});

describe('unified failed timing metadata', () => {
  it('persists failed state and emits it before the error without a completed duration', async () => {
    const { emit, rows, sent } = fixture();
    await emit({ response_type: 'bos', role: OpenAIMessageRole.ASSISTANT });
    await emit({
      response_type: 'delta',
      message: { reasoning_content: 'partial' },
    });
    await emit({ response_type: 'error', message: 'model failed' });
    expect(rows.get('m1')!.attrs?.answer_timing).toMatchObject({
      status: 'failed',
      run_id: 'run',
    });
    expect(rows.get('m1')!.attrs?.answer_timing?.duration_ms).toBeUndefined();
    expect(sent.slice(-2).map((chunk) => chunk.response_type)).toEqual([
      'delta',
      'error',
    ]);
    await emit({ response_type: 'done' });
    expect(rows.get('m1')!.attrs?.answer_timing?.status).toBe('failed');
  });

  it('measures final EOS rather than post-answer hooks and emits the stored snapshot', async () => {
    const { emit, context, rows, messages, sent } = fixture();
    await emit({ response_type: 'bos', role: OpenAIMessageRole.ASSISTANT });
    await emit({ response_type: 'delta', message: { content: 'final' } });
    await emit({ response_type: 'eos' });
    context.lastEos.monotonic = context.answerTiming.startedAtMonotonic + 4500;
    messages.indexFinalAssistant.mockImplementation(() => {
      context.lastEos.monotonic += 50000;
    });
    await emit({ response_type: 'done' });
    const persisted = rows.get('m1')!.attrs!.answer_timing!;
    expect(persisted.duration_ms).toBe(4500);
    expect(
      sent.find((chunk) => chunk.attrs?.answer_timing?.status === 'complete')
        .attrs.answer_timing,
    ).toEqual(persisted);
  });
});
