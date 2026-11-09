import {
  MessageStatus,
  OpenAIMessageRole,
} from 'omniboxd/messages/entities/message.entity';

import { StreamService } from './stream.service';

const QUERY_RECEIVED = 1_000_000_000;
const FIRST_AWAIT_DELAY = 100;
const FINAL_CONTENT_DELAY = 1800;

type Entry = 'user' | 'share' | 'chat';

interface EmittedChunk {
  at: number;
  chunk: Record<string, any>;
}

interface FakeRow {
  id: string;
  conversationId: string;
  parentId: string | null;
  createdAt: Date;
  status: MessageStatus;
  message: Record<string, any>;
  attrs: Record<string, any> | null;
  inputTokenCached: number;
  inputTokenUncached: number;
  outputToken: number;
}

function multiRoundChunks(): EmittedChunk[] {
  return [
    {
      at: QUERY_RECEIVED + 1000,
      chunk: { response_type: 'bos', role: OpenAIMessageRole.ASSISTANT },
    },
    {
      at: QUERY_RECEIVED + 1100,
      chunk: {
        response_type: 'delta',
        message: { content: 'early answer' },
      },
    },
    {
      at: QUERY_RECEIVED + 1150,
      chunk: {
        response_type: 'delta',
        message: { tool_calls: [{ id: 'call-1' }] },
      },
    },
    {
      at: QUERY_RECEIVED + 1200,
      chunk: { response_type: 'eos' },
    },
    {
      at: QUERY_RECEIVED + 1300,
      chunk: { response_type: 'bos', role: OpenAIMessageRole.TOOL },
    },
    {
      at: QUERY_RECEIVED + 1400,
      chunk: {
        response_type: 'delta',
        message: { content: 'tool output' },
      },
    },
    {
      at: QUERY_RECEIVED + 1500,
      chunk: { response_type: 'eos' },
    },
    {
      at: QUERY_RECEIVED + 1600,
      chunk: { response_type: 'bos', role: OpenAIMessageRole.ASSISTANT },
    },
    {
      at: QUERY_RECEIVED + 1700,
      chunk: {
        response_type: 'delta',
        message: { reasoning_content: 'thinking' },
      },
    },
    {
      at: QUERY_RECEIVED + FINAL_CONTENT_DELAY,
      chunk: {
        response_type: 'delta',
        message: { content: 'final answer' },
      },
    },
    {
      at: QUERY_RECEIVED + 1900,
      chunk: { response_type: 'eos' },
    },
    {
      at: QUERY_RECEIVED + 2000,
      chunk: { response_type: 'done' },
    },
  ];
}

function fixture(script: EmittedChunk[]) {
  const rows = new Map<string, FakeRow>();
  let sequence = 0;
  const messagesService = {
    findOne: jest.fn().mockResolvedValue({ attrs: {} }),
    create: jest.fn(
      (
        _namespaceId: string,
        conversationId: string,
        _userId: string | null,
        dto: any,
      ) => {
        const row: FakeRow = {
          id: `message-${++sequence}`,
          conversationId,
          parentId: dto.parentId ?? null,
          createdAt: new Date(),
          status: dto.status ?? MessageStatus.PENDING,
          message: { ...dto.message },
          attrs: dto.attrs ?? null,
          inputTokenCached: 0,
          inputTokenUncached: 0,
          outputToken: 0,
        };
        rows.set(row.id, row);
        return Promise.resolve(row);
      },
    ),
    updateDelta: jest.fn((id: string, delta: any) => {
      const row = rows.get(id)!;
      row.message.content = `${row.message.content ?? ''}${delta.message.content ?? ''}`;
      if (delta.message.reasoning_content) {
        row.message.reasoning_content = `${row.message.reasoning_content ?? ''}${delta.message.reasoning_content}`;
      }
      if (delta.message.tool_calls) {
        row.message.tool_calls = delta.message.tool_calls;
      }
      return Promise.resolve(row);
    }),
    update: jest.fn((id: string, _ns: string, _c: string, dto: any) => {
      const row = rows.get(id)!;
      Object.assign(row, dto);
      return Promise.resolve(row);
    }),
    findAll: jest.fn(() => Promise.resolve([...rows.values()])),
    setAnswerTiming: jest.fn().mockResolvedValue(undefined),
    indexFinalAssistant: jest.fn().mockResolvedValue(undefined),
  };

  let now = QUERY_RECEIVED;
  const clock = jest.spyOn(Date, 'now').mockImplementation(() => now);
  const conversationsService = {
    findOneForUserInNamespace: jest.fn(() => {
      now = QUERY_RECEIVED + FIRST_AWAIT_DELAY;
      return Promise.resolve({});
    }),
  };
  const traceService = {
    emitTraceEvents: jest.fn().mockResolvedValue(undefined),
  };
  const hooks = {
    onCallCompleted: jest.fn().mockResolvedValue(undefined),
    onStreamClosed: jest.fn().mockResolvedValue(undefined),
  };
  const service = new StreamService(
    { get: jest.fn() } as any,
    {} as any,
    messagesService as any,
    conversationsService as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    { t: (key: string) => key } as any,
    { mint: () => '' } as any,
    hooks as any,
    traceService as any,
  );
  jest.spyOn(service as any, 'startRedisSession').mockResolvedValue(undefined);
  jest.spyOn(service as any, 'getRedisClient').mockResolvedValue(null);
  jest.spyOn(service as any, 'isSessionCanceled').mockResolvedValue(false);
  jest
    .spyOn(service as any, 'resolveStreamParent')
    .mockImplementation((_n: string, dto: any) => {
      now = QUERY_RECEIVED + FIRST_AWAIT_DELAY;
      return Promise.resolve(dto.parent_message_id);
    });
  const stream = jest
    .spyOn(service, 'stream')
    .mockImplementation(
      async (
        _namespaceId: string,
        _mode: string,
        _body: any,
        _requestId: string,
        emit: (data: string) => Promise<void>,
      ) => {
        for (const { at, chunk } of script) {
          now = at;
          await emit(JSON.stringify(chunk));
        }
      },
    );

  const run = async (
    entry: Entry,
    mode: 'ask' | 'write' = 'ask',
    requestId = 'request-id',
  ) => {
    const chunks: any[] = [];
    const dto = {
      conversation_id: 'conversation',
      query: 'question',
      tools: [],
      channel: 'web',
    } as any;
    if (entry === 'chat') {
      chunks.push(
        ...(await service.chat('user', 'namespace', dto, requestId, mode)),
      );
      return chunks;
    }
    const observable =
      entry === 'user'
        ? await service.createUserAgentStream(
            'user',
            'namespace',
            dto,
            requestId,
            mode,
          )
        : await service.createShareAgentStream(
            {
              id: 'share-id',
              namespaceId: 'namespace',
              shareType: 'chat_only',
            } as any,
            dto,
            requestId,
            mode,
          );
    await new Promise<void>((resolve, reject) =>
      observable.subscribe({
        next: (event) => chunks.push(JSON.parse(event.data as string)),
        complete: resolve,
        error: reject,
      }),
    );
    return chunks;
  };

  return {
    service,
    rows,
    messagesService,
    traceService,
    stream,
    clock,
    run,
  };
}

function firstTokenEvents(traceService: { emitTraceEvents: jest.Mock }) {
  return traceService.emitTraceEvents.mock.calls
    .flatMap(([events]) => events)
    .filter((event: any) => event.name === 'chat_first_content_token');
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('query first content token timing', () => {
  it.each(['user', 'share', 'chat'] as const)(
    'reports the final round first content token from the %s entry',
    async (entry) => {
      const { traceService, stream, run } = fixture(multiRoundChunks());

      const chunks = await run(entry);

      expect(stream).toHaveBeenCalledTimes(1);
      expect(traceService.emitTraceEvents).toHaveBeenCalledTimes(1);
      const events = firstTokenEvents(traceService);
      expect(events).toHaveLength(1);
      const props = events[0].props;
      expect(props).toMatchObject({
        schema_version: 1,
        conversation_id: 'conversation',
        request_id: 'request-id',
        query_received_at: QUERY_RECEIVED,
        first_content_token_at: QUERY_RECEIVED + FINAL_CONTENT_DELAY,
        channel: 'web',
        mode: 'ask',
        source: 'server',
      });
      expect(props.first_content_token_latency_ms).toBe(
        props.first_content_token_at - props.query_received_at,
      );
      expect(props.first_content_token_latency_ms).toBe(FINAL_CONTENT_DELAY);

      const queryBos = chunks.find(
        (chunk) => chunk.response_type === 'bos' && chunk.role === 'user',
      );
      const answerBos = chunks
        .filter(
          (chunk) =>
            chunk.response_type === 'bos' && chunk.role === 'assistant',
        )
        .at(-1);
      expect(props.query_message_id).toBe(queryBos.id);
      expect(props.answer_message_id).toBe(answerBos.id);
      if (entry === 'share') {
        expect(props.share_id).toBe('share-id');
      } else {
        expect(props).not.toHaveProperty('share_id');
      }
    },
  );

  it('records query received before the first await and reports write mode', async () => {
    const { traceService, stream, run } = fixture(multiRoundChunks());

    await run('user', 'write');

    expect(stream.mock.calls[0][1]).toBe('write');
    const events = firstTokenEvents(traceService);
    expect(events).toHaveLength(1);
    expect(events[0].props.query_received_at).toBe(QUERY_RECEIVED);
    expect(events[0].props.mode).toBe('write');
  });

  it('does not report a replayed query that was reused', async () => {
    const { messagesService, rows, traceService, stream, run } =
      fixture(multiRoundChunks());
    const create = messagesService.create.getMockImplementation()!;
    messagesService.create.mockImplementation(async (...args: any[]) => {
      const row = await create(args[0], args[1], args[2], args[3]);
      if (args[3].message.role === OpenAIMessageRole.USER) {
        (row as any).reused = true;
        rows.set('saved-answer', {
          id: 'saved-answer',
          conversationId: row.conversationId,
          parentId: row.id,
          createdAt: new Date(),
          status: MessageStatus.SUCCESS,
          message: {
            role: OpenAIMessageRole.ASSISTANT,
            content: 'previous answer',
          },
          attrs: null,
          inputTokenCached: 0,
          inputTokenUncached: 0,
          outputToken: 0,
        });
      }
      return row;
    });

    const chunks = await run('user');

    expect(chunks.at(-1)).toEqual({ response_type: 'done' });
    expect(stream).not.toHaveBeenCalled();
    expect(firstTokenEvents(traceService)).toHaveLength(0);
  });

  it('does not report a stream that never receives done', async () => {
    const script = multiRoundChunks().filter(
      ({ chunk }) => chunk.response_type !== 'done',
    );
    const { traceService, stream, run } = fixture(script);

    await run('user');

    expect(stream).toHaveBeenCalledTimes(1);
    expect(firstTokenEvents(traceService)).toHaveLength(0);
  });
});
