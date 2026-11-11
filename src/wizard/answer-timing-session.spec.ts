import {
  Message,
  MessageStatus,
  OpenAIMessageRole,
} from 'omniboxd/messages/entities/message.entity';
import { MessagesService } from 'omniboxd/messages/messages.service';

import { StreamService } from './stream.service';

function fixture() {
  const rows = new Map<string, Message>();
  let sequence = 0;
  const repo = {
    findOneByOrFail: jest.fn(({ id }) => Promise.resolve(rows.get(id))),
    findOneBy: jest.fn(({ id }) => Promise.resolve(rows.get(id) ?? null)),
    findOneOrFail: jest.fn(({ where }) => Promise.resolve(rows.get(where.id))),
    find: jest.fn(() => Promise.resolve([...rows.values()])),
    save: jest.fn((row: Message) => {
      rows.set(row.id, row);
      return Promise.resolve(row);
    }),
  };
  const manager = { getRepository: () => repo, save: repo.save };
  const messages = new MessagesService(
    repo as any,
    {} as any,
    { transaction: (fn) => fn(manager) } as any,
    {} as any,
    {} as any,
    { t: (key: string) => key } as any,
  );
  jest.spyOn(messages, 'create').mockImplementation((_n, _c, _u, dto) => {
    const row: Message = {
      attrs: null,
      parentId: null,
      userId: _u,
      conversationId: _c,
      updatedAt: new Date(),
      deletedAt: null,
      ...dto,
      message: { ...dto.message, role: dto.message.role as OpenAIMessageRole },
      id: `message-${++sequence}`,
      createdAt: new Date(),
      status: dto.status ?? MessageStatus.PENDING,
      inputTokenCached: 0,
      inputTokenUncached: 0,
      outputToken: 0,
    };
    rows.set(row.id, row);
    return Promise.resolve(row);
  });
  jest
    .spyOn(messages, 'findOne')
    .mockImplementation((id) => Promise.resolve(rows.get(id)!));
  jest
    .spyOn(messages, 'findAll')
    .mockImplementation(() => Promise.resolve([...rows.values()]));
  jest
    .spyOn(messages, 'update')
    .mockImplementation((id, _n, _c, dto) =>
      Promise.resolve(Object.assign(rows.get(id)!, dto)),
    );
  jest.spyOn(messages, 'updateDelta').mockImplementation((id, delta) => {
    const row = rows.get(id)!;
    row.message = { ...row.message, ...delta.message };
    row.attrs = { ...row.attrs, ...delta.attrs };
    return Promise.resolve(row);
  });
  jest.spyOn(messages, 'indexFinalAssistant').mockResolvedValue(undefined);
  const service = new StreamService(
    { get: jest.fn() } as any,
    {} as any,
    messages,
    { findOneForUserInNamespace: jest.fn() } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    { t: (key: string) => key } as any,
    { mint: () => '' } as any,
    { onStreamClosed: jest.fn().mockResolvedValue(undefined) } as any,
  );
  jest.spyOn(service as any, 'startRedisSession').mockResolvedValue(undefined);
  jest.spyOn(service as any, 'getRedisClient').mockResolvedValue(null);
  jest.spyOn(service as any, 'isSessionCanceled').mockResolvedValue(false);
  jest
    .spyOn(service as any, 'resolveStreamParent')
    .mockImplementation((_n, dto: any) =>
      Promise.resolve(dto.parent_message_id),
    );
  const stream = jest
    .spyOn(service, 'stream')
    .mockImplementation(async (_n, _mode, _body, _requestId, emit) => {
      for (const chunk of [
        { response_type: 'bos', role: OpenAIMessageRole.ASSISTANT },
        {
          response_type: 'delta',
          message: { reasoning_content: 'think', content: 'answer' },
        },
        { response_type: 'eos' },
        { response_type: 'done' },
      ])
        await emit(JSON.stringify(chunk));
    });
  const run = async (
    requestId: string | undefined,
    parentId?: string,
    decisions = false,
    share = false,
  ) => {
    const dto = {
      conversation_id: 'conversation',
      query: 'question',
      tools: [],
      parent_message_id: parentId,
      ...(decisions ? { tool_call: { decisions: [{ type: 'approve' }] } } : {}),
    } as any;
    const observable = share
      ? await service.createShareAgentStream(
          {
            id: 'share',
            namespaceId: 'namespace',
            shareType: 'chat_only',
          } as any,
          dto,
          requestId!,
          'ask',
        )
      : await service.createUserAgentStream(
          'user',
          'namespace',
          dto,
          requestId!,
          'ask',
        );
    const chunks: any[] = [];
    await new Promise<void>((resolve, reject) =>
      observable.subscribe({
        next: (event) => chunks.push(JSON.parse(event.data as string)),
        complete: resolve,
        error: reject,
      }),
    );
    return chunks;
  };
  return { service, messages, rows, stream, run };
}

describe('answer timing execution identity', () => {
  it.each([undefined, '', ' \t '])(
    'generates a shared identity for initial and regenerated answers without a header (%p)',
    async (header) => {
      const { rows, stream, run } = fixture();
      const first = await run(header);
      const query = [...rows.values()].find(
        (row) => row.message.role === OpenAIMessageRole.USER,
      )!;
      const regenerated = await run(header, query.id);
      const ids = new Set<string>();
      for (const [index, chunks] of [first, regenerated].entries()) {
        const bos = chunks.find(
          (chunk) =>
            chunk.response_type === 'bos' && chunk.role === 'assistant',
        );
        const row = rows.get(bos.id)!;
        const timing = row.attrs!.answer_timing!;
        expect(timing.run_id).toMatch(/^[\da-f-]{36}$/);
        expect(timing.status).toBe('complete');
        expect(row.attrs!.turn_run_id).toBe(timing.run_id);
        expect(bos.attrs.turn_run_id).toBe(timing.run_id);
        expect(stream.mock.calls[index][3]).toBe(timing.run_id);
        expect(
          chunks.find(
            (chunk) => chunk.attrs?.answer_timing?.status === 'complete',
          )?.attrs.answer_timing,
        ).toEqual(timing);
        ids.add(timing.run_id);
      }
      expect(ids.size).toBe(2);
    },
  );

  it('preserves an explicit request identity', async () => {
    const { rows, stream, run } = fixture();
    await run('caller-request');
    expect(stream.mock.calls[0][3]).toBe('caller-request');
    expect([...rows.values()].at(-1)!.attrs!.answer_timing!.run_id).toBe(
      'caller-request',
    );
  });

  it('generates an identity for a share visitor', async () => {
    const { rows, stream, run } = fixture();
    await run(undefined, undefined, false, true);
    const timing = [...rows.values()].at(-1)!.attrs!.answer_timing!;
    expect(timing.run_id).toMatch(/^[\da-f-]{36}$/);
    expect(timing.status).toBe('complete');
    expect(stream.mock.calls[0][3]).toBe(timing.run_id);
  });

  it.each([undefined, '', ' '])(
    'continues approval timing without a request header (%p)',
    async (header) => {
      const { rows, stream, run } = fixture();
      rows.set('approval', {
        id: 'approval',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        userId: 'user',
        conversationId: 'conversation',
        parentId: null,
        inputTokenUncached: 0,
        inputTokenCached: 0,
        outputToken: 0,
        status: MessageStatus.SUCCESS,
        message: { role: OpenAIMessageRole.TOOL },
        attrs: {
          tool_call: {
            interrupts: [
              { name: 'approval', args: {}, decisions: ['approve'] },
            ],
          },
          answer_timing: {
            version: 1,
            answer_id: 'answer',
            run_id: 'previous-run',
            status: 'paused',
            started_at: new Date(Date.now() - 3600000).toISOString(),
            duration_ms: 2000,
          },
        },
      });
      const clock = jest.spyOn(performance, 'now').mockReturnValue(100);
      const original = stream.getMockImplementation()!;
      stream.mockImplementation(async (...args) => {
        clock.mockReturnValue(600);
        await original(...args);
      });
      try {
        await run(header, 'approval', true);
        const timing = [...rows.values()].at(-1)!.attrs!.answer_timing!;
        expect(timing).toMatchObject({
          answer_id: 'answer',
          status: 'complete',
          duration_ms: 2500,
        });
        expect(timing.run_id).toMatch(/^[\da-f-]{36}$/);
        expect(stream.mock.calls[0][3]).toBe(timing.run_id);
      } finally {
        clock.mockRestore();
      }
    },
  );

  it('keeps cancellation bound to the generated run', async () => {
    const { service, messages, rows, stream, run } = fixture();
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    stream.mockImplementation(
      async (_n, _mode, _body, _requestId, emit, signal) => {
        await emit(JSON.stringify({ response_type: 'bos', role: 'assistant' }));
        await emit(
          JSON.stringify({
            response_type: 'delta',
            message: { content: 'partial' },
          }),
        );
        await new Promise<void>((_resolve, reject) => {
          signal!.addEventListener(
            'abort',
            () => reject(new Error('aborted')),
            { once: true },
          );
          started();
        });
      },
    );
    const stop = jest.spyOn(messages, 'stopRunning');
    const pending = run(undefined);
    await ready;
    const answer = [...rows.values()].at(-1)!;
    const runId = answer.attrs!.answer_timing!.run_id;
    await service.cancelUserAgentStream('user', 'namespace', 'conversation');
    await pending;
    expect(runId).toMatch(/^[\da-f-]{36}$/);
    expect(stop).toHaveBeenCalledWith(
      'namespace',
      'conversation',
      'user',
      answer.id,
      { id: runId, queryId: answer.parentId },
    );
    expect(rows.get(answer.id)!.attrs!.answer_timing!.status).toBe('stopped');
    expect(rows.get(answer.parentId!)!.attrs!.stopped_runs).toContain(runId);
  });
});
