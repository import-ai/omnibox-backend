import { HttpStatus, MessageEvent } from '@nestjs/common';
import { AgentStream } from 'omniboxd/agent-stream-hooks/agent-stream-hooks.interface';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import {
  beginAnswerTiming,
  finishAnswerTiming,
} from 'omniboxd/messages/answer-timing';
import {
  MessageStatus,
  OpenAIMessageRole,
} from 'omniboxd/messages/entities/message.entity';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import { StreamService } from 'omniboxd/wizard/stream.service';
import { Observable } from 'rxjs';

function createService(mocks: {
  configService?: { get: jest.Mock };
  messagesService?: Record<string, jest.Mock>;
  conversationsService?: Record<string, jest.Mock>;
  namespaceResourcesService?: Record<string, jest.Mock>;
  sharedResourcesService?: Record<string, jest.Mock>;
  resourcesService?: Record<string, jest.Mock>;
  smartFoldersService?: Record<string, jest.Mock>;
  traceService?: Record<string, jest.Mock>;
}) {
  return new StreamService(
    (mocks.configService ?? { get: jest.fn() }) as any,
    {} as any,
    (mocks.messagesService ?? {
      indexFinalAssistant: jest.fn().mockResolvedValue(undefined),
    }) as any,
    mocks.conversationsService as any,
    mocks.namespaceResourcesService as any,
    mocks.sharedResourcesService as any,
    mocks.resourcesService as any,
    mocks.smartFoldersService as any,
    { t: jest.fn((key: string) => key) } as any,
    { mint: jest.fn(() => 'share-access-token') } as any,
    {
      onCallCompleted: jest.fn().mockResolvedValue(undefined),
      onStreamClosed: jest.fn().mockResolvedValue(undefined),
    } as any,
    mocks.traceService as any,
  );
}

describe('server answer timing', () => {
  function fixture() {
    const rows = new Map<string, any>();
    let sequence = 0;
    const messagesService = {
      create: jest.fn((_n, _c, _u, dto) => {
        const row = {
          ...dto,
          id: `message-${++sequence}`,
          createdAt: new Date(),
          status: dto.status ?? MessageStatus.PENDING,
        };
        rows.set(row.id, row);
        return Promise.resolve(row);
      }),
      updateDelta: jest.fn((id, delta) => {
        const row = rows.get(id);
        row.message = { ...row.message, ...delta.message };
        row.attrs = { ...row.attrs, ...delta.attrs };
        return Promise.resolve(row);
      }),
      update: jest.fn((id, _n, _c, dto) =>
        Promise.resolve(Object.assign(rows.get(id), dto)),
      ),
      finalizeAnswerTiming: jest.fn((id, run, outcome, end) => {
        const row = rows.get(id);
        if (row.attrs?.answer_timing?.run_id === run)
          row.attrs.answer_timing = finishAnswerTiming(
            row.attrs.answer_timing,
            outcome,
            end,
          );
        return Promise.resolve(row);
      }),
      indexFinalAssistant: jest.fn(),
    };
    const service = createService({ messagesService });
    const send = jest.fn().mockResolvedValue(undefined);
    const context: any = {
      runId: 'run',
      parentId: 'query',
      answerTiming: beginAnswerTiming('run', [], 1000),
    };
    const handler = service.agentHandler('n', 'c', '', send);
    const emit = (chunk: object) => handler(JSON.stringify(chunk), context);
    return { emit, context, send, rows, messagesService, service };
  }

  afterEach(() => jest.restoreAllMocks());

  test('publishes single-node reasoning duration after final completion and persists before sending', async () => {
    const { emit, rows, send, messagesService } = fixture();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(1500);
    await emit({ response_type: 'bos', role: 'assistant' });
    await emit({
      response_type: 'delta',
      message: { reasoning_content: 'think', content: 'answer' },
    });
    clock.mockReturnValue(5000);
    await emit({ response_type: 'eos', role: 'assistant' });
    expect(messagesService.finalizeAnswerTiming).not.toHaveBeenCalled();
    clock.mockReturnValue(8000);
    await emit({ response_type: 'done' });
    expect(rows.get('message-1').attrs.answer_timing).toMatchObject({
      outcome: 'success',
      duration_ms: 4000,
    });
    const snapshot = send.mock.calls
      .map(([data]) => JSON.parse(data))
      .find(
        (chunk) =>
          chunk.response_type === 'delta' &&
          chunk.attrs?.answer_timing?.outcome === 'success',
      );
    expect(snapshot?.attrs.answer_timing.duration_ms).toBe(4000);
    const snapshotIndex = send.mock.calls.findIndex(
      ([data]) => JSON.parse(data).attrs?.answer_timing?.outcome === 'success',
    );
    expect(snapshotIndex).toBeGreaterThanOrEqual(0);
    expect(
      messagesService.finalizeAnswerTiming.mock.invocationCallOrder[0],
    ).toBeLessThan(send.mock.invocationCallOrder[snapshotIndex]);
    await emit({ response_type: 'done' });
    expect(messagesService.finalizeAnswerTiming).toHaveBeenCalledTimes(1);
  });

  test.each([undefined, ''])(
    'finalizes independent regenerated runs without a request header (%s)',
    async (requestId) => {
      const { service, rows, messagesService } = fixture();
      const query = {
        id: 'query',
        message: { role: OpenAIMessageRole.USER, content: 'question' },
        attrs: {},
      };
      rows.set(query.id, query);
      Object.assign(messagesService, {
        findOne: jest.fn().mockResolvedValue(query),
      });
      jest
        .spyOn(service as any, 'startRedisSession')
        .mockResolvedValue(undefined);
      jest.spyOn(service as any, 'getRedisClient').mockResolvedValue(null);
      jest.spyOn(service as any, 'isSessionCanceled').mockResolvedValue(false);
      const clock = jest.spyOn(Date, 'now').mockReturnValue(1000);
      jest
        .spyOn(service as any, 'stream')
        .mockImplementation(async (...args: any[]) => {
          const emit = args[4];
          await emit(
            JSON.stringify({ response_type: 'bos', role: 'assistant' }),
          );
          await emit(
            JSON.stringify({
              response_type: 'delta',
              message: { content: 'answer', reasoning_content: 'think' },
            }),
          );
          clock.mockReturnValue(Date.now() + 2000);
          await emit(
            JSON.stringify({ response_type: 'eos', role: 'assistant' }),
          );
          await emit(JSON.stringify({ response_type: 'done' }));
        });
      const timings: any[] = [];
      for (let branch = 0; branch < 2; branch++) {
        const session = (service as any).startAgentSession(
          'key',
          'n',
          { conversation_id: 'c', query: 'question' },
          requestId,
          'ask',
          'user',
          '',
          query.id,
          [query],
        );
        await new Promise<void>((resolve) =>
          session.subscribers.add({
            closed: false,
            next: jest.fn(),
            complete: resolve,
          }),
        );
        const completed = [...rows.values()]
          .filter((row) => row.message.role === 'assistant')
          .at(-1);
        const timing = completed.attrs.answer_timing;
        expect(timing).toMatchObject({
          run_id: expect.any(String),
          answer_id: expect.any(String),
          outcome: 'success',
          duration_ms: 2000,
        });
        expect(completed.attrs.turn_run_id).toBe(timing.run_id);
        const delivered = session.events.map((data: string) =>
          JSON.parse(data),
        );
        expect(delivered.at(-2).attrs.answer_timing).toEqual(timing);
        expect(delivered.at(-1).response_type).toBe('done');
        timings.push(timing);
      }
      expect(timings[0].run_id).not.toBe(timings[1].run_id);
      expect(timings[0].duration_ms).toBe(2000);
    },
  );

  test('does not use an intermediate tool-call eos as the final endpoint', async () => {
    const { emit, rows } = fixture();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(2000);
    await emit({ response_type: 'bos', role: 'assistant' });
    await emit({
      response_type: 'delta',
      message: { tool_calls: [{ id: 'tool' }] },
    });
    await emit({ response_type: 'eos', role: 'assistant' });
    await emit({ response_type: 'bos', role: 'assistant' });
    await emit({ response_type: 'delta', message: { content: 'answer' } });
    clock.mockReturnValue(7000);
    await emit({ response_type: 'eos', role: 'assistant' });
    await emit({ response_type: 'done' });
    expect(rows.get('message-2').attrs.answer_timing?.duration_ms).toBe(6000);
    expect(rows.get('message-1').attrs.answer_timing?.outcome).toBe('running');
  });

  test('freezes an approval pause at the interruption event instead of DONE', async () => {
    const { emit, rows } = fixture();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(6000);
    await emit({ response_type: 'bos', role: 'assistant' });
    await emit({
      response_type: 'delta',
      message: {},
      attrs: { tool_call: { interrupts: [{}] } },
    });
    clock.mockReturnValue(9000);
    await emit({ response_type: 'eos', role: 'assistant' });
    await emit({ response_type: 'done' });
    expect(rows.get('message-1').attrs.answer_timing).toMatchObject({
      outcome: 'paused',
      duration_ms: 5000,
    });
  });

  test.each(['done', 'error'])(
    'keeps inserted timing and %s events ordered for Redis replay',
    async (terminal) => {
      const { emit, send, service } = fixture();
      let sequence = 10;
      const redis = {
        incr: jest.fn(() => Promise.resolve(++sequence)),
        expire: jest.fn(),
        sendCommand: jest.fn(),
      };
      jest.spyOn(service as any, 'getRedisClient').mockResolvedValue(redis);
      const session: any = { key: 'stream', subscribers: new Set() };
      send.mockImplementation((data) =>
        (service as any).sendSessionData(session, data),
      );
      jest.spyOn(Date, 'now').mockReturnValue(5000);
      await emit({ response_type: 'bos', role: 'assistant', event_id: '1-1' });
      await emit({
        response_type: 'delta',
        message: { content: 'answer' },
        event_id: '1-2',
      });
      if (terminal === 'done')
        await emit({
          response_type: 'eos',
          role: 'assistant',
          event_id: '1-3',
        });
      await emit({
        response_type: terminal,
        message: 'failure',
        event_id: '1-10',
      });
      const events = session.events.map((payload: string) =>
        JSON.parse(payload),
      );
      expect(events.at(-2).attrs.answer_timing.outcome).toBe(
        terminal === 'done' ? 'success' : 'failed',
      );
      expect(events.at(-1).response_type).toBe(terminal);
      const ids = events.map((event: any) =>
        Number(event.event_id.split('-')[1]),
      );
      expect(ids).toEqual([...ids].sort((a, b) => a - b));
      expect(new Set(ids).size).toBe(ids.length);
    },
  );

  test('ignores upstream timing and persists failed duration on tool errors', async () => {
    const { emit, rows } = fixture();
    jest.spyOn(Date, 'now').mockReturnValue(3500);
    await emit({
      response_type: 'bos',
      role: 'tool',
      attrs: { answer_timing: { duration_ms: 999 } },
    });
    await emit({
      response_type: 'delta',
      message: {},
      attrs: { answer_timing: { outcome: 'success', duration_ms: 999 } },
    });
    expect(rows.get('message-1').attrs.answer_timing.outcome).toBe('running');
    await emit({ response_type: 'error', message: 'tool failed' });
    await emit({ response_type: 'done' });
    expect(rows.get('message-1').attrs.answer_timing).toMatchObject({
      outcome: 'failed',
      duration_ms: 2500,
    });
  });
});

describe('StreamService conversation ownership', () => {
  const accessDenied = new Error('conversation access denied');

  it.each(['ask', 'write'] as const)(
    'answers %s for a foreign conversation with an error chunk and no stream',
    async (action) => {
      const conversationsService = {
        findOneForUserInNamespace: jest
          .fn()
          .mockRejectedValue(
            new AppException(
              'denied',
              'CONVERSATION_ACCESS_DENIED',
              HttpStatus.FORBIDDEN,
            ),
          ),
      };
      const service = createService({ conversationsService });
      const createAgentStream = jest.spyOn(service as any, 'createAgentStream');

      const observable = await service.createUserAgentStream(
        'user-id',
        'namespace-id',
        {
          conversation_id: 'conversation-id',
        } as any,
        'request-id',
        action,
      );
      const events: MessageEvent[] = [];
      await new Promise<void>((resolve) =>
        observable.subscribe({
          next: (event) => events.push(event),
          complete: resolve,
        }),
      );

      expect(events.map((event) => JSON.parse(event.data as string))).toEqual([
        {
          response_type: 'error',
          code: 'conversation_access_denied',
          message: 'denied',
        },
      ]);
      expect(createAgentStream).not.toHaveBeenCalled();
    },
  );

  it('rejects resume before reading stream state', async () => {
    const conversationsService = {
      findOneForUserInNamespace: jest.fn().mockRejectedValue(accessDenied),
    };
    const service = createService({ conversationsService });
    const resumeAgentStream = jest.spyOn(service as any, 'resumeAgentStream');

    await expect(
      service.resumeUserAgentStream(
        'user-id',
        'namespace-id',
        'conversation-id',
      ),
    ).rejects.toBe(accessDenied);

    expect(resumeAgentStream).not.toHaveBeenCalled();
  });

  it('reports a server-side chat error to trace with request context', async () => {
    const conversationsService = {
      findOneForUserInNamespace: jest
        .fn()
        .mockRejectedValue(
          new AppException('denied', 'CONVERSATION_ACCESS_DENIED', 403),
        ),
    };
    const traceService = {
      emitTraceEvents: jest.fn().mockResolvedValue(undefined),
    };
    const service = createService({ conversationsService, traceService });

    const observable = await service.createUserAgentStream(
      'user-id',
      'namespace-id',
      {
        conversation_id: 'conversation-id',
        channel: 'web',
      } as any,
      'request-id',
      'ask',
      undefined,
      'explicit',
      { platform: 'web' },
    );
    await new Promise<void>((resolve) =>
      observable.subscribe({ complete: resolve }),
    );

    expect(traceService.emitTraceEvents).toHaveBeenCalledWith(
      [
        {
          name: 'chat_error',
          props: expect.objectContaining({
            conversation_id: 'conversation-id',
            request_id: 'request-id',
            channel: 'web',
            stage: 'transport',
            error_category: 'forbidden',
            error_group: 'auth',
            error_code: 'conversation_access_denied',
            http_status: 403,
            error_message: 'denied',
            source: 'server',
            dedupe_key:
              'user-id:conversation-id:request-id:transport:conversation_access_denied:sending:visible',
          }),
        },
      ],
      {
        userId: 'user-id',
        platform: 'web',
        clientVersion: undefined,
        clientBuild: undefined,
      },
    );
  });

  it('does not trace expected decision control flow', async () => {
    const traceService = {
      emitTraceEvents: jest.fn().mockResolvedValue(undefined),
    };
    const service = createService({ traceService });
    const observable = service.errorChunkStream(
      new AppException('waiting', 'PENDING_INTERRUPT', 409),
      {
        conversationId: 'conversation-id',
        requestId: 'request-id',
        stage: 'transport',
      },
    );

    await new Promise<void>((resolve) =>
      observable.subscribe({ complete: resolve }),
    );

    expect(traceService.emitTraceEvents).not.toHaveBeenCalled();
  });

  it('does not emit duplicate trace events for the same request stage and code', () => {
    const traceService = {
      emitTraceEvents: jest.fn().mockResolvedValue(undefined),
    };
    const service = createService({ traceService });
    const error = new AppException('denied', 'CONVERSATION_ACCESS_DENIED', 403);
    const context = {
      userId: 'user-id',
      conversationId: 'conversation-id',
      requestId: 'request-id',
      channel: 'web',
      stage: 'stream',
    };

    (service as any).reportChatErrorTrace(error, context);
    (service as any).reportChatErrorTrace(error, context);

    expect(traceService.emitTraceEvents).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['CONVERSATION_NOT_FOUND', 404, 'not_found', 'request'],
    ['LOCAL_RUNTIME_SEQUENCE', 409, 'tool_failed', 'service'],
    ['INVALID_CLIENT_REQUEST_ID', 400, 'invalid_request', 'request'],
  ])('normalizes %s to %s/%s', (code, status, category, group) => {
    const traceService = {
      emitTraceEvents: jest.fn().mockResolvedValue(undefined),
    };
    const service = createService({ traceService });

    (service as any).reportChatErrorTrace(
      new AppException('failed', code, status),
      {
        userId: 'user-id',
        conversationId: 'conversation-id',
        requestId: `request-${code}`,
        channel: 'web',
        stage: 'stream',
      },
    );

    expect(
      traceService.emitTraceEvents.mock.calls[0][0][0].props,
    ).toMatchObject({
      error_category: category,
      error_group: group,
      error_code: code.toLowerCase(),
    });
  });

  it('does not deduplicate the same request across users or conversations', () => {
    const traceService = {
      emitTraceEvents: jest.fn().mockResolvedValue(undefined),
    };
    const service = createService({ traceService });
    const error = new AppException('denied', 'CONVERSATION_ACCESS_DENIED', 403);
    const base = {
      requestId: 'request-id',
      channel: 'web',
      stage: 'stream',
    };

    (service as any).reportChatErrorTrace(error, {
      ...base,
      userId: 'user-1',
      conversationId: 'conversation-id',
    });
    (service as any).reportChatErrorTrace(error, {
      ...base,
      userId: 'user-2',
      conversationId: 'conversation-id',
    });
    (service as any).reportChatErrorTrace(error, {
      ...base,
      userId: 'user-1',
      conversationId: 'other-conversation-id',
    });

    expect(traceService.emitTraceEvents).toHaveBeenCalledTimes(3);
  });

  it('traces the real client platform instead of the API channel', async () => {
    const conversationsService = {
      findOneForUserInNamespace: jest
        .fn()
        .mockRejectedValue(
          new AppException('denied', 'CONVERSATION_ACCESS_DENIED', 403),
        ),
    };
    const traceService = {
      emitTraceEvents: jest.fn().mockResolvedValue(undefined),
    };
    const service = createService({ conversationsService, traceService });

    const observable = await service.createUserAgentStream(
      'user-id',
      'namespace-id',
      {
        conversation_id: 'conversation-id',
        channel: 'mobile',
      } as any,
      'request-id',
      'ask',
      undefined,
      'explicit',
      { platform: 'ios', clientVersion: '0.1.56', clientBuild: '56' },
    );
    await new Promise<void>((resolve) =>
      observable.subscribe({ complete: resolve }),
    );

    expect(traceService.emitTraceEvents).toHaveBeenCalledWith(
      [
        {
          name: 'chat_error',
          props: expect.objectContaining({ channel: 'mobile' }),
        },
      ],
      {
        userId: 'user-id',
        platform: 'ios',
        clientVersion: '0.1.56',
        clientBuild: '56',
      },
    );
  });

  it('rejects cancel before mutating stream state', async () => {
    const conversationsService = {
      findOneForUserInNamespace: jest.fn().mockRejectedValue(accessDenied),
    };
    const service = createService({ conversationsService });
    const cancelAgentStream = jest.spyOn(service as any, 'cancelAgentStream');

    await expect(
      service.cancelUserAgentStream(
        'user-id',
        'namespace-id',
        'conversation-id',
      ),
    ).rejects.toBe(accessDenied);

    expect(cancelAgentStream).not.toHaveBeenCalled();
  });
});

describe('StreamService agent handler', () => {
  it('sends the persisted message creation time in bos data', async () => {
    const service = createService({});
    const createdAt = new Date('2026-07-10T08:00:00.000Z');
    (service as any).messagesService = {
      create: jest.fn().mockResolvedValue({
        id: 'message-id',
        parentId: null,
        createdAt,
        message: { role: 'assistant' },
      }),
    };
    const send = jest.fn().mockResolvedValue(undefined);
    const handler = service.agentHandler(
      'namespace-id',
      'conversation-id',
      'user-id',
      send,
    );

    await handler(
      JSON.stringify({ response_type: 'bos', role: 'assistant' }),
      {},
    );

    expect(JSON.parse(send.mock.calls[0][0])).toMatchObject({
      response_type: 'bos',
      id: 'message-id',
      created_at: createdAt.toISOString(),
    });
  });
});

describe('StreamService private_search visible resources', () => {
  it('expands empty private_search resources when the flag is unset', async () => {
    const namespaceResourcesService = {
      getAllResourcesByUser: jest.fn().mockResolvedValue([
        {
          id: 'smart-folder-id',
          name: 'Smart folder',
          resourceType: ResourceType.SMART_FOLDER,
        },
      ]),
      permissionFilter: jest.fn(),
    };
    const service = createService({
      namespaceResourcesService,
      resourcesService: {},
    });

    const result = await (service as any).getUserVisibleResources(
      'namespace-id',
      'user-id',
      [],
    );

    expect(result).toEqual([
      {
        id: 'smart-folder-id',
        name: 'Smart folder',
        type: 'folder',
      },
    ]);
    expect(
      namespaceResourcesService.getAllResourcesByUser,
    ).toHaveBeenCalledWith('user-id', 'namespace-id');
    expect(namespaceResourcesService.permissionFilter).not.toHaveBeenCalled();
  });

  it('does not scan the namespace when expanding empty resources is disabled', async () => {
    const namespaceResourcesService = {
      getAllResourcesByUser: jest.fn(),
      permissionFilter: jest.fn(),
    };
    const service = createService({
      configService: {
        get: jest.fn((key: string) =>
          key === 'OBB_ASK_EXPAND_EMPTY_VISIBLE_RESOURCES'
            ? 'false'
            : undefined,
        ),
      },
      namespaceResourcesService,
      resourcesService: {},
    });

    const result = await (service as any).getUserVisibleResources(
      'namespace-id',
      'user-id',
      [],
    );

    expect(result).toEqual([]);
    expect(
      namespaceResourcesService.getAllResourcesByUser,
    ).not.toHaveBeenCalled();
    expect(namespaceResourcesService.permissionFilter).not.toHaveBeenCalled();
  });

  it('expands selected smart folders through the virtual smart-folder children list', async () => {
    const namespaceResourcesService = {
      permissionFilter: jest.fn((_namespaceId, _userId, resources) => [
        ...resources,
      ]),
      getAllSubResourcesByUser: jest.fn(),
    };
    const resourcesService = {
      getResourceMeta: jest.fn().mockResolvedValue({
        id: 'smart-folder-id',
        name: 'Smart folder',
        resourceType: ResourceType.SMART_FOLDER,
      }),
    };
    const smartFoldersService = {
      listChildren: jest.fn().mockResolvedValue([
        {
          id: 'matched-doc-id',
          name: 'Matched doc',
          resourceType: ResourceType.DOC,
        },
      ]),
    };
    const service = createService({
      namespaceResourcesService,
      resourcesService,
      smartFoldersService,
    });

    const result = await (service as any).getUserVisibleResources(
      'namespace-id',
      'user-id',
      [
        {
          id: 'smart-folder-id',
          name: 'Smart folder',
          type: 'folder',
        },
      ],
    );

    expect(smartFoldersService.listChildren).toHaveBeenCalledWith(
      'user-id',
      'namespace-id',
      'smart-folder-id',
    );
    expect(
      namespaceResourcesService.getAllSubResourcesByUser,
    ).not.toHaveBeenCalled();
    expect(result).toEqual([
      {
        id: 'smart-folder-id',
        name: 'Smart folder',
        type: 'folder',
        child_ids: ['matched-doc-id'],
      },
      {
        id: 'matched-doc-id',
        name: 'Matched doc',
        type: 'resource',
      },
    ]);
  });

  it('treats shared smart folders as folders when all shared resources are exposed', async () => {
    const sharedResourcesService = {
      getAllSharedResources: jest.fn().mockResolvedValue([
        {
          id: 'smart-folder-id',
          name: 'Smart folder',
          resourceType: ResourceType.SMART_FOLDER,
        },
        {
          id: 'matched-doc-id',
          name: 'Matched doc',
          resourceType: ResourceType.DOC,
        },
      ]),
    };
    const service = createService({
      sharedResourcesService,
      resourcesService: {},
    });

    const result = await (service as any).getShareVisibleResources(
      {
        namespaceId: 'namespace-id',
      },
      [],
    );

    expect(result).toEqual([
      {
        id: 'smart-folder-id',
        name: 'Smart folder',
        type: 'folder',
      },
      {
        id: 'matched-doc-id',
        name: 'Matched doc',
        type: 'resource',
      },
    ]);
  });

  it('expands selected shared smart folders through shared resource children', async () => {
    const sharedResourcesService = {
      getAndValidateResource: jest.fn().mockResolvedValue({
        id: 'smart-folder-id',
        resourceType: ResourceType.SMART_FOLDER,
      }),
      getSharedResourceChildren: jest.fn().mockResolvedValue([
        {
          id: 'matched-doc-id',
          name: 'Matched doc',
          resourceType: ResourceType.DOC,
        },
      ]),
    };
    const resourcesService = {
      getChildren: jest.fn(),
    };
    const service = createService({
      sharedResourcesService,
      resourcesService,
    });

    const result = await (service as any).getShareVisibleResources(
      {
        namespaceId: 'namespace-id',
      },
      [
        {
          id: 'smart-folder-id',
          name: 'Smart folder',
          type: 'folder',
        },
      ],
    );

    expect(
      sharedResourcesService.getSharedResourceChildren,
    ).toHaveBeenCalledWith(
      {
        namespaceId: 'namespace-id',
      },
      'smart-folder-id',
    );
    expect(resourcesService.getChildren).not.toHaveBeenCalled();
    expect(result).toEqual([
      {
        id: 'smart-folder-id',
        name: 'Smart folder',
        type: 'folder',
        child_ids: ['matched-doc-id'],
      },
      {
        id: 'matched-doc-id',
        name: 'Matched doc',
        type: 'resource',
      },
    ]);
  });
});

describe('StreamService parent resolution', () => {
  const request = {
    conversation_id: 'conversation-id',
    query: 'hello',
    tools: [],
  };

  function serviceWith(messagesService: Record<string, jest.Mock>) {
    const service = createService({ messagesService });
    jest.spyOn(service as any, 'getRedisClient').mockResolvedValue(null);
    return service;
  }

  it('follows the latest message inside the conversation lock', async () => {
    const messagesService = {
      findLatest: jest.fn().mockResolvedValue({
        id: 'latest-id',
        conversationId: 'conversation-id',
        message: { role: 'assistant' },
      }),
      findOneInConversation: jest.fn(),
    };
    const service = serviceWith(messagesService);

    await expect(
      (service as any).resolveStreamParent(
        'namespace-id',
        request,
        'user-id',
        '',
        'latest',
      ),
    ).resolves.toBe('latest-id');

    expect(messagesService.findLatest).toHaveBeenCalledWith(
      'user-id',
      'conversation-id',
    );
    expect(messagesService.findOneInConversation).not.toHaveBeenCalled();
  });

  it('puts a new question beside a latest question whose reply never came', async () => {
    const answer = {
      id: 'answer-id',
      conversationId: 'conversation-id',
      message: { role: 'assistant' },
      attrs: {},
    };
    const messagesService = {
      findLatest: jest.fn().mockResolvedValue({
        id: 'unanswered-id',
        parentId: 'answer-id',
        conversationId: 'conversation-id',
        message: { role: 'user' },
        attrs: {},
      }),
      findOneInConversation: jest.fn().mockResolvedValue(answer),
    };
    const service = serviceWith(messagesService);

    await expect(
      (service as any).resolveStreamParent(
        'namespace-id',
        request,
        'user-id',
        '',
        'latest',
      ),
    ).resolves.toBe('answer-id');

    expect(messagesService.findOneInConversation).toHaveBeenCalledWith(
      'answer-id',
      'conversation-id',
      'user-id',
    );
  });

  it('starts a new root beside a first question whose reply never came', async () => {
    const messagesService = {
      findLatest: jest.fn().mockResolvedValue({
        id: 'unanswered-id',
        parentId: null,
        conversationId: 'conversation-id',
        message: { role: 'user' },
        attrs: {},
      }),
      findOneInConversation: jest.fn(),
    };
    const service = serviceWith(messagesService);

    await expect(
      (service as any).resolveStreamParent(
        'namespace-id',
        request,
        'user-id',
        '',
        'latest',
      ),
    ).resolves.toBeUndefined();

    expect(messagesService.findOneInConversation).not.toHaveBeenCalled();
  });

  it('keeps an explicit parent instead of replacing it with the latest message', async () => {
    const messagesService = {
      findLatest: jest.fn(),
      findOneInConversation: jest.fn().mockResolvedValue({
        id: 'parent-id',
        conversationId: 'conversation-id',
        message: { role: 'user' },
      }),
    };
    const service = serviceWith(messagesService);

    await expect(
      (service as any).resolveStreamParent(
        'namespace-id',
        { ...request, parent_message_id: 'parent-id' },
        'user-id',
        '',
        'explicit',
      ),
    ).resolves.toBe('parent-id');

    expect(messagesService.findLatest).not.toHaveBeenCalled();
  });

  it('rejects a normal reply while the latest message waits for a decision', async () => {
    const messagesService = {
      findLatest: jest.fn().mockResolvedValue({
        id: 'interrupt-id',
        conversationId: 'conversation-id',
        message: { role: 'assistant' },
        attrs: {
          tool_call: { interrupts: [{ id: 'call-1' }, { id: 'call-2' }] },
        },
      }),
    };
    const service = serviceWith(messagesService);

    const error = await (service as any)
      .resolveStreamParent('namespace-id', request, 'user-id', '', 'latest')
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'PENDING_INTERRUPT' });
    expect(error.getResponse()).toMatchObject({
      code: 'pending_interrupt',
      message_id: 'interrupt-id',
      interrupt_count: 2,
    });
  });

  it('allows a decision to resume a pending interrupt', async () => {
    const messagesService = {
      findOneInConversation: jest.fn().mockResolvedValue({
        id: 'interrupt-id',
        conversationId: 'conversation-id',
        message: { role: 'assistant' },
        attrs: { tool_call: { interrupts: [{ id: 'call-1' }] } },
      }),
    };
    const service = serviceWith(messagesService);

    await expect(
      (service as any).resolveStreamParent(
        'namespace-id',
        {
          ...request,
          parent_message_id: 'interrupt-id',
          tool_call: { decisions: [{ type: 'approve' }] },
        },
        'user-id',
        '',
        'explicit',
      ),
    ).resolves.toBe('interrupt-id');
  });

  it('does not join an in-memory session that is already streaming', async () => {
    const service = serviceWith({});
    (service as any).streamSessions.set(
      'user:user-id:namespace-id:conversation-id',
      {
        finished: false,
      },
    );

    await expect(
      (service as any).createAgentStream(
        'namespace-id',
        request,
        'request-id',
        'ask',
        'user-id',
      ),
    ).rejects.toMatchObject({ code: 'CONVERSATION_BUSY' });
  });

  function lockedServiceWith(messagesService: Record<string, jest.Mock>) {
    const service = createService({ messagesService });
    jest
      .spyOn(service, 'acquireConversationLock')
      .mockResolvedValue(jest.fn().mockResolvedValue(undefined));
    jest
      .spyOn(service as any, 'claimStreamActive')
      .mockResolvedValue(undefined);
    return service;
  }

  const interruptMessage = {
    id: 'interrupt-id',
    conversationId: 'conversation-id',
    message: { role: 'assistant' },
    attrs: { tool_call: { interrupts: [{ id: 'call-1' }] } },
  };
  const decisionRequest = {
    ...request,
    parent_message_id: 'interrupt-id',
    tool_call: { decisions: [{ type: 'reject', end_turn: true }] },
  };

  it('resumes an interrupt nobody has decided yet', async () => {
    const messagesService = {
      findOneInConversation: jest.fn().mockResolvedValue(interruptMessage),
      hasChildren: jest.fn().mockResolvedValue(false),
    };
    const service = lockedServiceWith(messagesService);

    await expect(
      (service as any).resolveStreamParent(
        'namespace-id',
        decisionRequest,
        'user-id',
        '',
        'explicit',
      ),
    ).resolves.toBe('interrupt-id');
    expect(messagesService.hasChildren).toHaveBeenCalledWith(
      'interrupt-id',
      'conversation-id',
    );
  });

  it('refuses to decide an interrupt that already has a reply', async () => {
    const service = lockedServiceWith({
      findOneInConversation: jest.fn().mockResolvedValue(interruptMessage),
      hasChildren: jest.fn().mockResolvedValue(true),
    });

    const error = await (service as any)
      .resolveStreamParent(
        'namespace-id',
        decisionRequest,
        'user-id',
        '',
        'explicit',
      )
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'INTERRUPT_ALREADY_DECIDED' });
    expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(error.getResponse()).toMatchObject({
      code: 'interrupt_already_decided',
      message_id: 'interrupt-id',
    });
  });

  it('sends an already decided interrupt to the web as an error chunk', async () => {
    const service = createService({
      conversationsService: {
        findOneForUserInNamespace: jest.fn().mockResolvedValue({}),
      },
      messagesService: {
        findOneInConversation: jest.fn().mockResolvedValue(interruptMessage),
        hasChildren: jest.fn().mockResolvedValue(true),
      },
    });
    jest
      .spyOn(service, 'acquireConversationLock')
      .mockResolvedValue(jest.fn().mockResolvedValue(undefined));

    const observable = await service.createUserAgentStream(
      'user-id',
      'namespace-id',
      decisionRequest as any,
      'request-id',
      'ask',
    );

    await expect(chunksOf(observable)).resolves.toEqual([
      expect.objectContaining({
        response_type: 'error',
        code: 'interrupt_already_decided',
        message_id: 'interrupt-id',
      }),
    ]);
  });

  describe('decisions that were not applied', () => {
    const decision = {
      id: 'decision-d',
      parentId: 'interrupt-id',
      conversationId: 'conversation-id',
      message: { role: 'user', content: '' },
      attrs: {
        tool_call: {
          decisions: [{ type: 'reject' }, { type: 'reject' }],
        },
      },
    };
    const failedReply = {
      id: 'failed-f',
      parentId: 'decision-d',
      conversationId: 'conversation-id',
      status: 'failed',
      message: { role: 'assistant', content: '' },
      attrs: { error_message: 'fetch failed' },
    };
    const toolResult = {
      id: 'tool-t',
      parentId: 'decision-d',
      status: 'success',
      message: { role: 'tool', content: 'rejected' },
      attrs: {},
    };

    function serviceWithMessages(
      messagesService: Record<string, jest.Mock>,
      lock?: Promise<unknown>,
    ) {
      const service = createService({ messagesService });
      jest
        .spyOn(service, 'acquireConversationLock')
        .mockImplementation(async () => {
          await lock;
          return jest.fn().mockResolvedValue(undefined);
        });
      jest
        .spyOn(service as any, 'claimStreamActive')
        .mockResolvedValue(undefined);
      return service;
    }

    const resolve = (
      service: StreamService,
      body: object,
      mode: 'latest' | 'explicit' = 'explicit',
    ) =>
      (service as any).resolveStreamParent(
        'namespace-id',
        { ...request, ...body },
        'user-id',
        '',
        mode,
      );
    const decisionsUnder = (parentId: string) => ({
      parent_message_id: parentId,
      tool_call: { decisions: [{ type: 'reject', end_turn: true }] },
    });

    it('refuses to resume a decision that already has a tool result', async () => {
      const service = serviceWithMessages({
        findOneInConversation: jest.fn().mockResolvedValue(decision),
        findChildren: jest.fn().mockResolvedValue([toolResult]),
      });

      const error = await resolve(service, decisionsUnder('decision-d')).catch(
        (e: unknown) => e,
      );

      expect(error.getResponse()).toMatchObject({
        code: 'interrupt_already_decided',
        message_id: 'decision-d',
      });
    });

    it('resumes again a decision whose resume only left a failed reply', async () => {
      const service = serviceWithMessages({
        findOneInConversation: jest.fn().mockResolvedValue(decision),
        findChildren: jest.fn().mockResolvedValue([failedReply]),
      });

      await expect(
        resolve(service, decisionsUnder('decision-d')),
      ).resolves.toBe('decision-d');
    });

    it('refuses a resume that waited behind another client resuming it', async () => {
      let release!: () => void;
      const lock = new Promise<void>((resolve) => (release = resolve));
      const children: object[] = [];
      const findChildren = jest.fn(() => Promise.resolve(children));
      const service = serviceWithMessages(
        {
          findOneInConversation: jest.fn().mockResolvedValue(decision),
          findChildren,
        },
        lock,
      );

      const parent = resolve(service, decisionsUnder('decision-d')).catch(
        (e: unknown) => e,
      );
      await Promise.resolve();
      // The other client's resume finishes while this request waits.
      children.push(toolResult);
      release();

      expect((await parent).getResponse()).toMatchObject({
        code: 'interrupt_already_decided',
      });
    });

    it.each([
      ['latest', {}, { findLatest: jest.fn().mockResolvedValue(failedReply) }],
      [
        'explicit',
        { parent_message_id: 'failed-f' },
        {
          findOneInConversation: jest.fn((id: string) =>
            Promise.resolve(id === 'failed-f' ? failedReply : decision),
          ),
        },
      ],
      [
        'explicit',
        { parent_message_id: 'answer-1', follow_latest: true },
        {
          findOneInConversation: jest.fn((id: string) =>
            Promise.resolve(
              id === 'answer-1'
                ? { id: 'answer-1', message: { role: 'assistant' }, attrs: {} }
                : decision,
            ),
          ),
          findLeafBelow: jest.fn().mockResolvedValue(failedReply),
        },
      ],
    ] as const)(
      'refuses a question (%s parent %j) under a decision that was not applied',
      async (mode, body, lookups) => {
        const service = serviceWithMessages({
          findOneInConversation: jest.fn().mockResolvedValue(decision),
          findChildren: jest.fn().mockResolvedValue([failedReply]),
          ...lookups,
        });

        const error = await resolve(service, body, mode).catch(
          (e: unknown) => e,
        );

        expect(error.getResponse()).toMatchObject({
          code: 'decision_not_applied',
          message_id: 'decision-d',
          interrupt_count: 2,
        });
      },
    );

    it('refuses a question under a decision that has no result at all', async () => {
      const service = serviceWithMessages({
        findLatest: jest.fn().mockResolvedValue(decision),
        findChildren: jest.fn().mockResolvedValue([]),
      });

      const error = await resolve(service, {}, 'latest').catch(
        (e: unknown) => e,
      );

      expect(error).toMatchObject({ code: 'DECISION_NOT_APPLIED' });
    });

    it('allows a question once the decision was applied', async () => {
      const service = serviceWithMessages({
        findLatest: jest.fn().mockResolvedValue(failedReply),
        findOneInConversation: jest.fn().mockResolvedValue(decision),
        findChildren: jest.fn().mockResolvedValue([failedReply, toolResult]),
      });

      await expect(resolve(service, {}, 'latest')).resolves.toBe('failed-f');
    });
  });

  describe('follow_latest', () => {
    const stale = {
      id: 'answer-1',
      conversationId: 'conversation-id',
      message: { role: 'assistant' },
      attrs: {},
    };
    const followRequest = {
      ...request,
      parent_message_id: 'answer-1',
      follow_latest: true,
    };

    function serviceFollowing(leaf: object | null, lock?: Promise<unknown>) {
      const messagesService = {
        findOneInConversation: jest.fn().mockResolvedValue(stale),
        findLeafBelow: jest.fn().mockResolvedValue(leaf),
      };
      const service = createService({ messagesService });
      jest
        .spyOn(service, 'acquireConversationLock')
        .mockImplementation(async () => {
          await lock;
          return jest.fn().mockResolvedValue(undefined);
        });
      jest
        .spyOn(service as any, 'claimStreamActive')
        .mockResolvedValue(undefined);
      return { service, messagesService };
    }

    const resolve = (service: StreamService, body: object) =>
      (service as any).resolveStreamParent(
        'namespace-id',
        body,
        'user-id',
        '',
        'explicit',
      );

    it('continues from the newest message below a stale parent', async () => {
      const { service, messagesService } = serviceFollowing({
        id: 'answer-2',
        message: { role: 'assistant' },
        attrs: {},
      });

      await expect(resolve(service, followRequest)).resolves.toBe('answer-2');
      expect(messagesService.findLeafBelow).toHaveBeenCalledWith(
        'answer-1',
        'conversation-id',
        'user-id',
      );
    });

    it('waits for the running reply before looking for the newest message', async () => {
      let release!: () => void;
      const lock = new Promise<void>((resolve) => (release = resolve));
      const { service, messagesService } = serviceFollowing(
        { id: 'answer-2', message: { role: 'assistant' }, attrs: {} },
        lock,
      );

      const parent = resolve(service, followRequest);
      await Promise.resolve();
      expect(messagesService.findLeafBelow).not.toHaveBeenCalled();
      release();

      await expect(parent).resolves.toBe('answer-2');
    });

    it('refuses a question below a newest message that waits for a decision', async () => {
      const { service } = serviceFollowing({
        id: 'interrupt-2',
        message: { role: 'assistant' },
        attrs: { tool_call: { interrupts: [{}, {}] } },
      });

      const error = await resolve(service, followRequest).catch(
        (e: unknown) => e,
      );

      expect(error.getResponse()).toMatchObject({
        code: 'pending_interrupt',
        message_id: 'interrupt-2',
        interrupt_count: 2,
      });
    });

    it('keeps the parent when the newest message is an unanswered question', async () => {
      const { service } = serviceFollowing({
        id: 'question-2',
        message: { role: 'user' },
        attrs: {},
      });

      await expect(resolve(service, followRequest)).resolves.toBe('answer-1');
    });

    it('keeps the given parent without the flag', async () => {
      const { service, messagesService } = serviceFollowing({
        id: 'answer-2',
        message: { role: 'assistant' },
        attrs: {},
      });

      await expect(
        resolve(service, { ...followRequest, follow_latest: undefined }),
      ).resolves.toBe('answer-1');
      expect(messagesService.findLeafBelow).not.toHaveBeenCalled();
    });
  });

  it('finds the parent of a share stream without a user id', async () => {
    const messagesService = {
      findOneInConversation: jest.fn().mockResolvedValue({
        id: 'parent-id',
        conversationId: 'conversation-id',
        message: { role: 'assistant' },
      }),
    };
    const service = lockedServiceWith(messagesService);

    await expect(
      (service as any).resolveStreamParent(
        'namespace-id',
        { ...request, parent_message_id: 'parent-id' },
        '',
        'share-id',
        'explicit',
      ),
    ).resolves.toBe('parent-id');

    expect(messagesService.findOneInConversation).toHaveBeenCalledWith(
      'parent-id',
      'conversation-id',
      '',
    );
  });

  it('rejects a parent outside the conversation', async () => {
    const service = lockedServiceWith({
      findOneInConversation: jest.fn().mockResolvedValue(null),
    });

    await expect(
      (service as any).resolveStreamParent(
        'namespace-id',
        { ...request, parent_message_id: 'other-parent-id' },
        'user-id',
        '',
        'explicit',
      ),
    ).rejects.toMatchObject({ code: 'PARENT_CONVERSATION_MISMATCH' });
  });

  async function chunksOf(observable: Observable<MessageEvent>) {
    const chunks: any[] = [];
    await new Promise<void>((resolve, reject) =>
      observable.subscribe({
        next: (event) => chunks.push(JSON.parse(event.data as string)),
        complete: resolve,
        error: reject,
      }),
    );
    return chunks;
  }

  const pending = new AppException(
    'This conversation is waiting for a tool decision',
    'PENDING_INTERRUPT',
    HttpStatus.CONFLICT,
    { message_id: 'interrupt-id', interrupt_count: 2 },
  );

  it('turns a share stream setup failure into an error chunk', async () => {
    const service = createService({});
    jest
      .spyOn(service as any, 'createAgentStream')
      .mockRejectedValue(new Error('setup failed'));

    const observable = await service.createShareAgentStream(
      { namespaceId: 'namespace-id', id: 'share-id' } as any,
      { ...request, parent_message_id: 'parent-id' } as any,
      'request-id',
      'ask',
    );

    await expect(chunksOf(observable)).resolves.toEqual([
      { response_type: 'error', message: 'system.errors.wizardRequestFailed' },
    ]);
  });

  it('sends a pending decision to the web as a parseable error chunk', async () => {
    const service = createService({
      conversationsService: {
        findOneForUserInNamespace: jest.fn().mockResolvedValue({}),
      },
    });
    jest.spyOn(service as any, 'createAgentStream').mockRejectedValue(pending);

    const observable = await service.createUserAgentStream(
      'user-id',
      'namespace-id',
      { ...request } as any,
      'request-id',
      'ask',
    );

    await expect(chunksOf(observable)).resolves.toEqual([
      {
        response_type: 'error',
        code: 'pending_interrupt',
        message: 'This conversation is waiting for a tool decision',
        message_id: 'interrupt-id',
        interrupt_count: 2,
      },
    ]);
  });

  it('keeps throwing a pending decision for the Open API', async () => {
    const service = createService({
      conversationsService: {
        findOneForUserInNamespace: jest.fn().mockResolvedValue({}),
      },
    });
    jest.spyOn(service as any, 'createAgentStream').mockRejectedValue(pending);

    await expect(
      service.chat('user-id', 'namespace-id', { ...request } as any, 'req'),
    ).rejects.toBe(pending);
  });
});

describe('StreamService redis stream replay', () => {
  it('sends stopped data when abort rejects the active stream', async () => {
    const service = createService({});
    (service as any).messagesService = { stopRunning: jest.fn() };
    const client = {
      expire: jest.fn(),
      incr: jest.fn().mockResolvedValue(1),
      sendCommand: jest.fn(),
      set: jest.fn(),
    };
    const subscriber = {
      closed: false,
      complete: jest.fn(),
      next: jest.fn(),
    };
    jest
      .spyOn(service as any, 'getRedisClient')
      .mockResolvedValue(client as any);
    jest
      .spyOn(service as any, 'startRedisSession')
      .mockResolvedValue(undefined);
    jest
      .spyOn(service as any, 'stream')
      .mockImplementation((...args: unknown[]) => {
        const signal = args[5] as AbortSignal | undefined;
        return new Promise<void>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('aborted')));
        });
      });

    const session = (service as any).startAgentSession(
      'stream-key',
      'namespace-id',
      { conversation_id: 'conversation-id' },
      'request-id',
      'ask',
      'user-id',
      '',
      undefined,
      [],
    );
    session.subscribers.add(subscriber);
    await Promise.resolve();

    await (service as any).stopSession(session);

    expect(subscriber.next).toHaveBeenCalledWith({
      data: expect.stringContaining('"response_type":"stopped"'),
    });
    expect(client.sendCommand).toHaveBeenCalled();
  });

  it('clears stale cancel state before starting a new stream session', async () => {
    const service = createService({});
    const client = {
      del: jest.fn(),
      exists: jest.fn().mockResolvedValue(0),
      set: jest.fn().mockResolvedValue('OK'),
    };
    const subscriber = {
      subscribe: jest.fn(),
    };
    jest
      .spyOn(service as any, 'getRedisClient')
      .mockResolvedValue(client as any);
    jest
      .spyOn(service as any, 'getRedisSubscriber')
      .mockResolvedValue(subscriber as any);

    await (service as any).startRedisSession({ key: 'stream-key' });

    expect(client.set).toHaveBeenCalledWith(
      'wizard:stream:stream-key:active',
      '1',
      { NX: true, EX: 3600 },
    );
    expect(client.del).toHaveBeenCalledWith([
      'wizard:stream:stream-key:events',
      'wizard:stream:stream-key:seq',
      'wizard:stream:stream-key:cancel',
    ]);
    expect(subscriber.subscribe).toHaveBeenCalledWith(
      'wizard:stream:stream-key:control',
      expect.any(Function),
    );
  });

  it('stores stream data with a server-side event id', async () => {
    const service = createService({});
    const client = {
      expire: jest.fn(),
      incr: jest.fn().mockResolvedValue(1),
      sendCommand: jest.fn(),
    };
    jest
      .spyOn(service as any, 'getRedisClient')
      .mockResolvedValue(client as any);
    const subscriber = {
      closed: false,
      next: jest.fn(),
    };

    await (service as any).sendSessionData(
      {
        finished: false,
        key: 'stream-key',
        subscribers: new Set([subscriber]),
      },
      JSON.stringify({
        response_type: 'delta',
        message: { content: 'hello' },
      }),
    );

    expect(client.sendCommand.mock.calls[0][0]).toEqual([
      'XADD',
      'wizard:stream:stream-key:events',
      'MAXLEN',
      '~',
      '10000',
      '1-1',
      'data',
      expect.any(String),
    ]);
    const payload = JSON.parse(subscriber.next.mock.calls[0][0].data);
    expect(payload).toMatchObject({
      event_id: '1-1',
      attrs: { stream_event_id: '1-1' },
    });
  });

  it('replays redis events with event_id and completes on terminal data', async () => {
    const service = createService({});
    const client = {
      exists: jest.fn().mockResolvedValue(1),
      isOpen: true,
      quit: jest.fn(),
      sendCommand: jest
        .fn()
        .mockResolvedValue([
          [
            'wizard:stream:stream-key:events',
            [['1-0', ['data', '{"response_type":"done"}']]],
          ],
        ]),
    };
    jest
      .spyOn(service as any, 'createRedisConnection')
      .mockResolvedValue(client as any);
    const subscriber = {
      closed: false,
      complete: jest.fn(),
      error: jest.fn(),
      next: jest.fn(),
    };

    await (service as any).resumeRedisStream(
      'stream-key',
      undefined,
      subscriber,
    );

    expect(subscriber.next).toHaveBeenCalledWith({
      data: '{"response_type":"done","event_id":"1-0"}',
    });
    expect(client.sendCommand.mock.calls[0][0]).toEqual([
      'XREAD',
      'BLOCK',
      '15000',
      'STREAMS',
      'wizard:stream:stream-key:events',
      '0-0',
    ]);
    expect(subscriber.complete).toHaveBeenCalledTimes(1);
    expect(client.quit).toHaveBeenCalledTimes(1);
  });
});

describe('StreamService citations on a chat-only share', () => {
  const citations = [
    { title: 'Secret roadmap', snippet: 'Q4 slip', link: 'resource-id' },
  ];

  it.each(['bos', 'delta'] as const)(
    'withholds %s citations from the visitor while keeping them stored',
    async (responseType) => {
      const stored: Record<string, any>[] = [];
      const service = createService({});
      (service as any).messagesService = {
        create: jest.fn().mockImplementation((_ns, _c, _u, dto) => {
          stored.push(dto.attrs);
          return { id: 'message-id', createdAt: new Date(), message: {} };
        }),
        updateDelta: jest.fn().mockImplementation((_id, chunk) => {
          stored.push(chunk.attrs);
          return { message: {} };
        }),
      };
      const sent: string[] = [];
      const handler = service.agentHandler(
        'namespace-id',
        'conversation-id',
        '',
        (data: string) => {
          sent.push(data);
          return Promise.resolve();
        },
        true,
      );

      await handler(
        JSON.stringify({
          response_type: responseType,
          role: 'assistant',
          message: {},
          attrs: { citations },
        }),
        { messageId: 'message-id' } as any,
      );

      const payload = JSON.parse(sent[0]);
      expect(payload.attrs?.citations).toBeUndefined();
      expect(sent[0]).not.toContain('Secret roadmap');
      // The assistant's own record keeps them.
      expect(stored[0]?.citations).toEqual(citations);
    },
  );

  it('leaves citations intact on a share that grants resources', async () => {
    const service = createService({});
    (service as any).messagesService = {
      updateDelta: jest.fn().mockResolvedValue({ message: {} }),
    };
    const sent: string[] = [];
    const handler = service.agentHandler(
      'namespace-id',
      'conversation-id',
      '',
      (data: string) => {
        sent.push(data);
        return Promise.resolve();
      },
      false,
    );

    await handler(
      JSON.stringify({
        response_type: 'delta',
        message: {},
        attrs: { citations },
      }),
      { messageId: 'message-id' } as any,
    );

    expect(JSON.parse(sent[0]).attrs.citations).toEqual(citations);
  });

  it('passes the chat-only flag through from a chat-only share', async () => {
    const service = createService({ sharedResourcesService: {} as any });
    const createAgentStream = jest
      .spyOn(service as any, 'createAgentStream')
      .mockResolvedValue({} as any);

    await service.createShareAgentStream(
      {
        id: 'share-id',
        namespaceId: 'namespace-id',
        shareType: 'chat_only',
      } as any,
      { conversation_id: 'conversation-id', tools: [] } as any,
      'request-id',
      'ask',
    );

    expect(createAgentStream).toHaveBeenCalledWith(
      'namespace-id',
      expect.anything(),
      'request-id',
      'ask',
      '',
      'share-id',
      true,
      undefined,
      'explicit',
      {},
    );
  });
});

describe('StreamService agent stream hooks', () => {
  const userStream = {
    namespaceId: 'namespace-id',
    streamId: 'user:user-id:namespace-id:conversation-id',
    shareId: undefined,
  };
  const shareStream = {
    namespaceId: 'namespace-id',
    streamId: 'share:share-id:namespace-id:conversation-id',
    shareId: 'share-id',
  };

  const createHookedService = (message: Record<string, any>) => {
    const hooks = {
      onCallCompleted: jest.fn(),
      onStreamClosed: jest.fn(),
      onStreamCompleted: jest.fn(),
    };
    hooks.onCallCompleted.mockResolvedValue(undefined);
    hooks.onStreamClosed.mockResolvedValue(undefined);
    const service = new StreamService(
      { get: jest.fn() } as any,
      {} as any,
      {
        updateDelta: jest.fn().mockResolvedValue({ message: {} }),
        update: jest.fn().mockResolvedValue({ message: {}, ...message }),
        indexFinalAssistant: jest.fn().mockResolvedValue(undefined),
      } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { mint: jest.fn(() => 'share-access-token') } as any,
      hooks as any,
    );
    return { service, hooks };
  };

  const eos = async (
    service: StreamService,
    agentStream: AgentStream | undefined,
  ) => {
    const handler = service.agentHandler(
      'namespace-id',
      'conversation-id',
      'user-id',
      jest.fn().mockResolvedValue(undefined),
      false,
      agentStream,
    );
    await handler(JSON.stringify({ response_type: 'eos', role: 'assistant' }), {
      messageId: 'message-id',
    } as any);
  };

  it('reports the finished message tokens on eos', async () => {
    const { service, hooks } = createHookedService({
      id: 'message-id',
      inputTokenCached: 12032,
      inputTokenUncached: 162,
      outputToken: 15,
    });

    await eos(service, userStream);

    expect(hooks.onCallCompleted).toHaveBeenCalledWith(
      userStream,
      'message-id',
      {
        inputTokenCached: 12032,
        inputTokenUncached: 162,
        outputToken: 15,
      },
    );
  });

  it('hands the hook the share a stream was opened through', async () => {
    // The share travels as its own field; nothing downstream has to parse it
    // back out of the stream key.
    const { service, hooks } = createHookedService({
      id: 'message-id',
      inputTokenCached: 0,
      inputTokenUncached: 100,
      outputToken: 5,
    });

    await eos(service, shareStream);

    expect(hooks.onCallCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ shareId: 'share-id' }),
      'message-id',
      expect.anything(),
    );
  });

  it('does not report a message that burned no tokens', async () => {
    const { service, hooks } = createHookedService({
      id: 'message-id',
      inputTokenCached: 0,
      inputTokenUncached: 0,
      outputToken: 0,
    });

    await eos(service, userStream);

    expect(hooks.onCallCompleted).not.toHaveBeenCalled();
  });

  it('does not report without a stream', async () => {
    const { service, hooks } = createHookedService({
      id: 'message-id',
      inputTokenCached: 0,
      inputTokenUncached: 100,
      outputToken: 5,
    });

    await eos(service, undefined);

    expect(hooks.onCallCompleted).not.toHaveBeenCalled();
  });

  it('indexes only the final assistant after done', async () => {
    const { service, hooks } = createHookedService({
      id: 'message-id',
      inputTokenCached: 0,
      inputTokenUncached: 100,
      outputToken: 5,
    });
    hooks.onStreamCompleted = jest.fn().mockResolvedValue(undefined);
    const handler = service.agentHandler(
      'namespace-id',
      'conversation-id',
      'user-id',
      jest.fn().mockResolvedValue(undefined),
      false,
      userStream,
    );

    await handler(JSON.stringify({ response_type: 'eos' }), {
      messageId: 'message-id',
    } as any);
    await handler(JSON.stringify({ response_type: 'done' }), {
      parentId: 'message-id',
    } as any);

    expect((service as any).messagesService.update).toHaveBeenCalledWith(
      'message-id',
      'namespace-id',
      'conversation-id',
      { status: MessageStatus.SUCCESS },
      false,
    );
    expect(
      (service as any).messagesService.indexFinalAssistant,
    ).toHaveBeenCalledWith(
      'message-id',
      'namespace-id',
      'conversation-id',
      expect.any(Function),
    );
    const callback = (service as any).messagesService.indexFinalAssistant.mock
      .calls[0][3];
    await callback(undefined);
    expect(hooks.onStreamCompleted).toHaveBeenCalledWith(
      userStream,
      'conversation-id',
      'message-id',
      undefined,
    );
  });
});

describe('trusted upstream billing metadata', () => {
  it('initializes billing before SSE callbacks and never forwards headers', async () => {
    const stream: AgentStream = { namespaceId: 'n', streamId: 's' };
    const payload = 'data: {"response_type":"done"}\n\n';
    const response = new Response(payload, {
      headers: { 'X-Omnibox-Billing': 'private-price' },
    });
    const started = jest.fn((context: AgentStream, upstream: Response) => {
      expect(upstream.headers.get('X-Omnibox-Billing')).toBe('private-price');
      context.billing = { edition: 'basic' };
    });
    const service = new StreamService(
      { get: jest.fn() } as never,
      { createAgentStream: jest.fn().mockResolvedValue(response) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { mint: jest.fn(() => 'share-access-token') } as never,
      {
        onStreamStarted: started,
        onCallCompleted: jest.fn(),
        onStreamClosed: jest.fn(),
      },
    );
    const callback = jest.fn((data: string) => {
      expect(stream.billing).toEqual({ edition: 'basic' });
      expect(data).not.toContain('private-price');
      return Promise.resolve();
    });
    await service.stream(
      'n',
      'ask',
      {} as never,
      'r',
      callback,
      undefined,
      stream,
    );
    expect(started).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('cancels an upstream response when billing validation fails', async () => {
    const response = new Response('data: {}\n\n');
    const cancel = jest.spyOn(response.body!, 'cancel');
    const failure = new Error('invalid pricing');
    const service = new StreamService(
      { get: jest.fn() } as never,
      { createAgentStream: jest.fn().mockResolvedValue(response) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { mint: jest.fn(() => 'share-access-token') } as never,
      {
        onStreamStarted: jest.fn().mockRejectedValue(failure),
        onCallCompleted: jest.fn(),
        onStreamClosed: jest.fn(),
      },
    );
    const callback = jest.fn();
    await expect(
      service.stream('n', 'ask', {} as never, 'r', callback, undefined, {
        namespaceId: 'n',
        streamId: 's',
      }),
    ).rejects.toBe(failure);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(callback).not.toHaveBeenCalled();
  });
});

describe('persisted query receipts', () => {
  it('sends a complete user receipt before contacting Wizard and persists enrichment on that same row', async () => {
    const service = createService({});
    const saved = {
      id: 'query-id',
      createdAt: new Date('2026-09-12T02:30:00Z'),
      parentId: null,
      message: { role: 'user', content: 'hello' },
      attrs: { user_context: { created_at: '2026-09-12T10:30:00+08:00' } },
    };
    const create = jest.fn().mockResolvedValue(saved);
    const update = jest.fn().mockResolvedValue(saved);
    (service as any).messagesService = {
      create,
      update,
      findOne: jest.fn().mockResolvedValue(saved),
      indexFinalAssistant: jest.fn().mockResolvedValue(undefined),
    };
    const events: any[] = [];
    jest
      .spyOn(service, 'stream')
      .mockImplementation(async (_ns, _mode, body, _req, callback) => {
        expect(events.map((e) => e.response_type)).toEqual([
          'bos',
          'delta',
          'eos',
        ]);
        expect(events[1].message.content).toBe('hello');
        expect(body.query_persisted).toBe(true);
        expect(body.messages).toEqual([saved]);
        await callback(
          JSON.stringify({
            response_type: 'query_attrs',
            attrs: {
              user_context: saved.attrs.user_context,
              context: { resources: [] },
            },
          }),
        );
        await callback(JSON.stringify({ response_type: 'done' }));
      });
    const observable = await (service as any).createAgentStream(
      'ns',
      { query: 'hello', conversation_id: 'conv', tools: [] },
      'req',
      'ask',
      'user',
    );
    await new Promise<void>((resolve, reject) =>
      observable.subscribe({
        next: (event: any) => events.push(JSON.parse(event.data)),
        complete: resolve,
        error: reject,
      }),
    );
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][3].attrs.user_context).toEqual({
      lang: '简体中文',
    });
    expect(update).toHaveBeenCalledWith(
      'query-id',
      'ns',
      'conv',
      expect.objectContaining({
        attrs: expect.objectContaining({ context: { resources: [] } }),
      }),
    );
    expect(events.map((e) => e.response_type)).toEqual([
      'bos',
      'delta',
      'eos',
      'done',
    ]);
  });

  it('reuses a historical user query for regeneration and supplies its original UTC time', async () => {
    const service = createService({});
    const query = {
      id: 'query-id',
      createdAt: new Date('2025-01-01T00:00:00Z'),
      parentId: null,
      message: { role: 'user', content: 'hello' },
    };
    const create = jest.fn();
    (service as any).messagesService = {
      findAll: jest.fn().mockResolvedValue([query]),
      create,
    };
    jest.spyOn(service, 'stream').mockImplementation((_ns, _mode, body) => {
      expect(body.messages[0].attrs?.user_context?.created_at).toBe(
        '2025-01-01T00:00:00.000Z',
      );
      return Promise.resolve();
    });
    const observable = await (service as any).createAgentStream(
      'ns',
      {
        query: 'hello',
        parent_message_id: 'query-id',
        conversation_id: 'conv',
        tools: [],
      },
      'req',
      'ask',
      'user',
    );
    await new Promise<void>((resolve, reject) =>
      observable.subscribe({ complete: resolve, error: reject }),
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('records the messaging channel on the user message', async () => {
    const service = createService({});
    const create = jest.fn().mockResolvedValue({
      id: 'query-id',
      parentId: null,
      message: { role: 'user', content: 'hello' },
      attrs: {},
    });
    (service as any).messagesService = { create, findOne: jest.fn() };
    jest.spyOn(service, 'stream').mockResolvedValue(undefined);

    const observable = await (service as any).createAgentStream(
      'ns',
      {
        query: 'hello',
        conversation_id: 'conv',
        tools: [],
        source_channel: 'qq',
      },
      'req',
      'ask',
      'user',
    );
    await new Promise<void>((resolve, reject) =>
      observable.subscribe({ complete: resolve, error: reject }),
    );

    expect(create.mock.calls[0][3].attrs.user_context).toEqual({
      lang: '简体中文',
      channel: 'qq',
    });
  });

  it('saves a decision as one message under the interrupt it resumes', async () => {
    const service = createService({});
    const interrupt = {
      id: 'interrupt-id',
      createdAt: new Date('2026-09-12T02:30:00Z'),
      parentId: null,
      message: { role: 'assistant', content: '' },
      attrs: { tool_call: { interrupts: [{ id: 'call-1' }] } },
    };
    const decision = {
      id: 'decision-id',
      parentId: 'interrupt-id',
      message: { role: 'user', content: '/reject' },
      attrs: {},
    };
    const create = jest.fn().mockResolvedValue(decision);
    (service as any).messagesService = {
      create,
      findOne: jest.fn(),
      findAll: jest.fn().mockResolvedValue([interrupt]),
    };
    jest.spyOn(service, 'stream').mockImplementation((_ns, _mode, body) => {
      expect(body.messages.map((message) => message.id)).toEqual([
        'interrupt-id',
        'decision-id',
      ]);
      return Promise.resolve();
    });

    const observable = await (service as any).createAgentStream(
      'ns',
      {
        query: '/reject',
        conversation_id: 'conv',
        parent_message_id: 'interrupt-id',
        tools: [],
        source_channel: 'qq',
        tool_call: { decisions: [{ type: 'reject' }] },
      },
      'req',
      'ask',
      'user',
    );
    await new Promise<void>((resolve, reject) =>
      observable.subscribe({ complete: resolve, error: reject }),
    );

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][3].parentId).toBe('interrupt-id');
    expect(create.mock.calls[0][3].message.content).toBe('/reject');
    expect(create.mock.calls[0][3].attrs.user_context).toEqual({
      lang: '简体中文',
      channel: 'qq',
    });
  });
});

describe('StreamService cancellation extensions', () => {
  it.each(['local', 'remote'])(
    'awaits deployment cancellation for a %s stream',
    async (location) => {
      const service = createService({}) as any;
      let finish!: () => void;
      const extension = jest.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      );
      service.agentStreamHooks.onCancellationRequested = extension;
      service.messagesService = {
        stopRunning: jest.fn().mockResolvedValue(undefined),
      };
      jest.spyOn(service, 'markSessionCanceled').mockResolvedValue(undefined);
      jest.spyOn(service, 'getRedisClient').mockResolvedValue(null);
      jest.spyOn(service, 'sendSessionData').mockResolvedValue(undefined);
      jest
        .spyOn(service, 'completeSession')
        .mockImplementation(() => undefined);
      const controller = new AbortController();
      const result =
        location === 'local'
          ? service.stopSession({
              key: 'key',
              namespaceId: 'space',
              conversationId: 'conversation',
              userId: 'user',
              controller,
              handlerContext: {},
            })
          : service.cancelAgentStream('key', 'space', 'conversation', 'user');
      expect(extension).toHaveBeenCalledWith('user', 'conversation');
      expect(service.messagesService.stopRunning).not.toHaveBeenCalled();
      expect(controller.signal.aborted).toBe(false);
      finish();
      await result;
      expect(service.messagesService.stopRunning).toHaveBeenCalledWith(
        'space',
        'conversation',
        'user',
        ...(location === 'local'
          ? [undefined, undefined, expect.any(Number)]
          : []),
      );
      expect(controller.signal.aborted).toBe(location === 'local');
    },
  );
});

describe('StreamService failed streams', () => {
  const start = (service: any) =>
    service.startAgentSession(
      'stream-key',
      'namespace-id',
      { conversation_id: 'conversation-id' },
      'request-id',
      'ask',
      'user-id',
      '',
      undefined,
      [],
    );
  const setup = (hook: jest.Mock) => {
    const service = createService({}) as any;
    service.agentStreamHooks.onCancellationRequested = hook;
    jest.spyOn(service, 'startRedisSession').mockResolvedValue(undefined);
    jest.spyOn(service, 'getRedisClient').mockResolvedValue(null);
    // An invalid request fails the turn before contacting Wizard, through the
    // same error path an upstream `terminated` takes.
    service.i18n = { t: (key: string) => key };
    const subscriber = { closed: false, complete: jest.fn(), next: jest.fn() };
    return { service, subscriber };
  };

  it.each([
    ['succeeds', jest.fn().mockResolvedValue(undefined)],
    ['fails', jest.fn().mockRejectedValue(new Error('Database unavailable'))],
  ])(
    'cancels deployment work when a turn fails and the hook %s',
    async (_name, hook) => {
      const { service, subscriber } = setup(hook);
      const session = start(service);
      session.subscribers.add(subscriber);
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(hook).toHaveBeenCalledTimes(1);
      expect(hook).toHaveBeenCalledWith('user-id', 'conversation-id');
      expect(subscriber.next).toHaveBeenCalledWith({
        data: expect.stringContaining('"response_type":"error"'),
      });
      expect(subscriber.complete).toHaveBeenCalled();
    },
  );

  it('does not call the hook for a share visitor stream', async () => {
    const hook = jest.fn().mockResolvedValue(undefined);
    const { service } = setup(hook);
    service.startAgentSession(
      'stream-key',
      'namespace-id',
      { conversation_id: 'conversation-id', query: 'hi' },
      'request-id',
      'ask',
      '',
      'share-id',
      undefined,
      [],
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(hook).not.toHaveBeenCalled();
  });
});

describe('StreamService.chat() never receives the SSE heartbeat', () => {
  const saved = {
    id: 'query-id',
    createdAt: new Date('2026-09-12T02:30:00Z'),
    parentId: null,
    message: { role: 'user', content: 'hello' },
  };

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('collects only wizard chunks for the non-streaming open API', async () => {
    const service = createService({
      conversationsService: {
        findOneForUserInNamespace: jest.fn().mockResolvedValue({}),
      },
    });
    (service as any).messagesService = {
      create: jest.fn().mockResolvedValue(saved),
      update: jest.fn().mockResolvedValue(saved),
      findOne: jest.fn().mockResolvedValue(saved),
      indexFinalAssistant: jest.fn().mockResolvedValue(undefined),
    };
    jest
      .spyOn(service, 'stream')
      .mockImplementation(async (_ns, _mode, _body, _req, callback) => {
        await new Promise((resolve) => setTimeout(resolve, 40_000));
        await callback(JSON.stringify({ response_type: 'done' }));
      });
    const chunks = service.chat(
      'user',
      'ns',
      { query: 'hello', conversation_id: 'conv', tools: [] } as any,
      'req',
    );
    await jest.advanceTimersByTimeAsync(40_000);
    expect((await chunks).map((chunk: any) => chunk.response_type)).toEqual([
      'bos',
      'delta',
      'eos',
      'done',
    ]);
  });
});

describe('StreamService agent handler error finalization', () => {
  function handlerWithMessages() {
    const service = createService({});
    const messagesService = {
      findOne: jest.fn().mockResolvedValue({ attrs: {} }),
      create: jest.fn(),
      updateDelta: jest.fn().mockResolvedValue({ message: {} }),
      update: jest.fn().mockResolvedValue({ message: {} }),
    };
    (service as any).messagesService = messagesService;
    const send = jest.fn().mockResolvedValue(undefined);
    const handler = service.agentHandler(
      'namespace-id',
      'conversation-id',
      'user-id',
      send,
    );
    return { handler, messagesService, send };
  }

  it('marks an open tool message as a failed tool call', async () => {
    const { handler, messagesService, send } = handlerWithMessages();

    await handler(JSON.stringify({ response_type: 'error', message: 'boom' }), {
      messageId: 'message-id',
      message: { role: OpenAIMessageRole.TOOL },
    });

    expect(messagesService.updateDelta).toHaveBeenCalledWith('message-id', {
      response_type: 'delta',
      message: {},
      attrs: {
        error_message: 'boom',
        tool_call: { status: 'failed', error: 'boom' },
      },
    });
    expect(messagesService.update).toHaveBeenCalledWith(
      'message-id',
      'namespace-id',
      'conversation-id',
      { status: MessageStatus.FAILED },
      false,
    );
    expect(JSON.parse(send.mock.calls[0][0])).toEqual({
      response_type: 'error',
      id: 'message-id',
      message: 'boom',
    });
  });

  it('leaves the attrs of an open assistant message alone', async () => {
    const { handler, messagesService } = handlerWithMessages();

    await handler(JSON.stringify({ response_type: 'error', message: 'boom' }), {
      messageId: 'message-id',
      message: { role: OpenAIMessageRole.ASSISTANT },
    });

    expect(messagesService.updateDelta).toHaveBeenCalledWith('message-id', {
      response_type: 'delta',
      message: {},
      attrs: { error_message: 'boom' },
    });
    expect(messagesService.update).toHaveBeenCalledWith(
      'message-id',
      'namespace-id',
      'conversation-id',
      { status: MessageStatus.FAILED },
      false,
    );
  });

  function sequencedHandler() {
    const result = handlerWithMessages();
    let created = 0;
    result.messagesService.create.mockImplementation(
      (_namespaceId, _conversationId, _userId, dto) => {
        created += 1;
        const id =
          created === 1
            ? 'assistant-id'
            : created === 2
              ? 'tool-id'
              : `synthetic-tool-${created}`;
        return Promise.resolve({
          id,
          parentId: dto.parentId,
          createdAt: new Date('2026-11-03T00:00:00.000Z'),
          message: dto.message,
        });
      },
    );
    result.messagesService.update.mockImplementation(
      (id, _namespaceId, _conversationId, changes) =>
        Promise.resolve({ id, message: {}, status: changes.status }),
    );
    return result;
  }

  it('links an old-wizard failed tool message to its pending tool call', async () => {
    const { handler, messagesService, send } = sequencedHandler();
    const context = {};

    await handler(
      JSON.stringify({
        response_type: 'bos',
        role: OpenAIMessageRole.ASSISTANT,
      }),
      context,
    );
    await handler(
      JSON.stringify({
        response_type: 'delta',
        message: {
          role: OpenAIMessageRole.ASSISTANT,
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'read_resource', arguments: '{}' },
            },
          ],
        },
      }),
      context,
    );
    await handler(
      JSON.stringify({
        response_type: 'eos',
        role: OpenAIMessageRole.ASSISTANT,
      }),
      context,
    );
    await handler(
      JSON.stringify({ response_type: 'bos', role: OpenAIMessageRole.TOOL }),
      context,
    );
    await handler(
      JSON.stringify({
        response_type: 'error',
        message: 'Unknown function: read_resource',
      }),
      context,
    );

    expect(messagesService.updateDelta).toHaveBeenLastCalledWith('tool-id', {
      response_type: 'delta',
      message: { tool_call_id: 'call_1' },
      attrs: {
        error_message: 'Unknown function: read_resource',
        tool_call: {
          status: 'failed',
          error: 'Unknown function: read_resource',
        },
      },
    });
    expect(messagesService.update).toHaveBeenLastCalledWith(
      'tool-id',
      'namespace-id',
      'conversation-id',
      { status: MessageStatus.FAILED },
      false,
    );
    expect(messagesService.create).toHaveBeenCalledTimes(2);
    expect(JSON.parse(send.mock.calls.at(-1)![0])).toEqual({
      response_type: 'error',
      id: 'tool-id',
      message: 'Unknown function: read_resource',
    });
  });

  it('chains failed rows for the remaining unmatched tool calls', async () => {
    const { handler, messagesService } = sequencedHandler();
    const context = {};

    await handler(
      JSON.stringify({
        response_type: 'bos',
        role: OpenAIMessageRole.ASSISTANT,
      }),
      context,
    );
    await handler(
      JSON.stringify({
        response_type: 'delta',
        message: {
          role: OpenAIMessageRole.ASSISTANT,
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'read_resource', arguments: '{}' },
            },
            {
              id: 'call_2',
              type: 'function',
              function: { name: 'read_resource', arguments: '{}' },
            },
            {
              id: 'call_3',
              type: 'function',
              function: { name: 'read_resource', arguments: '{}' },
            },
          ],
        },
      }),
      context,
    );
    await handler(
      JSON.stringify({ response_type: 'bos', role: OpenAIMessageRole.TOOL }),
      context,
    );
    await handler(
      JSON.stringify({ response_type: 'error', message: 'boom' }),
      context,
    );

    expect(messagesService.updateDelta).toHaveBeenLastCalledWith('tool-id', {
      response_type: 'delta',
      message: { tool_call_id: 'call_1' },
      attrs: {
        error_message: 'boom',
        tool_call: { status: 'failed', error: 'boom' },
      },
    });
    expect(messagesService.create).toHaveBeenCalledTimes(4);
    expect(messagesService.create).toHaveBeenNthCalledWith(
      3,
      'namespace-id',
      'conversation-id',
      'user-id',
      {
        message: {
          role: OpenAIMessageRole.TOOL,
          tool_call_id: 'call_2',
        },
        parentId: 'tool-id',
        status: MessageStatus.FAILED,
        attrs: { tool_call: { status: 'failed', error: 'boom' } },
      },
      false,
    );
    expect(messagesService.create).toHaveBeenNthCalledWith(
      4,
      'namespace-id',
      'conversation-id',
      'user-id',
      {
        message: {
          role: OpenAIMessageRole.TOOL,
          tool_call_id: 'call_3',
        },
        parentId: 'synthetic-tool-3',
        status: MessageStatus.FAILED,
        attrs: { tool_call: { status: 'failed', error: 'boom' } },
      },
      false,
    );
    expect(messagesService.update).toHaveBeenLastCalledWith(
      'tool-id',
      'namespace-id',
      'conversation-id',
      { status: MessageStatus.FAILED },
      false,
    );
  });

  it('opens an assistant message before failing when only a query is open', async () => {
    const { handler, messagesService, send } = handlerWithMessages();
    messagesService.create = jest.fn().mockResolvedValue({
      id: 'new-message-id',
      parentId: 'parent-id',
      createdAt: new Date('2026-07-10T08:00:00.000Z'),
      message: { role: OpenAIMessageRole.ASSISTANT },
    });

    await handler(JSON.stringify({ response_type: 'error', message: 'boom' }), {
      queryId: 'query-id',
      parentId: 'parent-id',
    });

    expect(messagesService.create).toHaveBeenCalledWith(
      'namespace-id',
      'conversation-id',
      'user-id',
      {
        message: { role: OpenAIMessageRole.ASSISTANT },
        parentId: 'parent-id',
        attrs: { turn_id: 'query-id' },
      },
      false,
    );
    expect(messagesService.updateDelta).toHaveBeenCalledWith('new-message-id', {
      response_type: 'delta',
      message: {},
      attrs: { error_message: 'boom' },
    });
    expect(messagesService.update).toHaveBeenCalledWith(
      'new-message-id',
      'namespace-id',
      'conversation-id',
      { status: MessageStatus.FAILED },
      false,
    );
    expect(JSON.parse(send.mock.calls.at(-1)![0])).toEqual({
      response_type: 'error',
      id: 'new-message-id',
      message: 'boom',
    });
  });
});

test('live BOS carries the same run identity used for persisted cancellation', async () => {
  const service = createService({});
  (service as any).messagesService = {
    findOne: jest.fn().mockResolvedValue({ attrs: {} }),
    create: jest.fn().mockResolvedValue({
      id: 'tool',
      parentId: 'decision',
      createdAt: new Date(),
      message: { role: 'tool' },
    }),
  };
  const send = jest.fn().mockResolvedValue(undefined);
  await service.agentHandler(
    'n',
    'c',
    'u',
    send,
  )(JSON.stringify({ response_type: 'bos', role: 'tool' }), {
    queryId: 'decision',
    runId: 'retry-run',
  });
  expect(JSON.parse(send.mock.calls[0][0]).attrs.turn_run_id).toBe('retry-run');
  expect(
    (service as any).messagesService.create.mock.calls[0][3].attrs,
  ).toMatchObject({ turn_id: 'decision', turn_run_id: 'retry-run' });
});

describe('StreamService persisted error codes', () => {
  it('persists the error code from an error chunk', async () => {
    const service = createService({});
    const deltaAttrs: Record<string, unknown>[] = [];
    (service as any).messagesService = {
      updateDelta: jest.fn().mockImplementation((_id, chunk) => {
        deltaAttrs.push(chunk.attrs);
        return { message: {} };
      }),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const sent: string[] = [];
    const handler = service.agentHandler(
      'namespace-id',
      'conversation-id',
      '',
      (data: string) => {
        sent.push(data);
        return Promise.resolve();
      },
      false,
    );

    await handler(
      JSON.stringify({
        response_type: 'error',
        code: 'content_review_rejected',
        message:
          '本次请求未通过模型服务的安全审核，请修改相关内容后重试，或新建对话。',
      }),
      { messageId: 'message-id' } as any,
    );

    expect(deltaAttrs).toEqual([
      {
        error_message:
          '本次请求未通过模型服务的安全审核，请修改相关内容后重试，或新建对话。',
        error_code: 'content_review_rejected',
      },
    ]);
    expect(JSON.parse(sent[0])).toMatchObject({
      response_type: 'error',
      id: 'message-id',
      code: 'content_review_rejected',
    });
  });

  it('persists only the message when the error chunk has no code', async () => {
    const service = createService({});
    const deltaAttrs: Record<string, unknown>[] = [];
    (service as any).messagesService = {
      updateDelta: jest.fn().mockImplementation((_id, chunk) => {
        deltaAttrs.push(chunk.attrs);
        return { message: {} };
      }),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const handler = service.agentHandler(
      'namespace-id',
      'conversation-id',
      '',
      jest.fn().mockResolvedValue(undefined),
      false,
    );

    await handler(
      JSON.stringify({ response_type: 'error', message: 'fetch failed' }),
      { messageId: 'message-id' } as any,
    );

    expect(deltaAttrs).toEqual([{ error_message: 'fetch failed' }]);
  });

  describe('replay of a saved failed message', () => {
    const failedMessage = (attrs: Record<string, unknown>) => ({
      id: 'message-id',
      parentId: null,
      conversationId: 'conversation-id',
      status: MessageStatus.FAILED,
      createdAt: new Date('2026-07-10T08:00:00.000Z'),
      message: { role: 'assistant', content: '' },
      attrs,
    });

    function replayableService() {
      const service = createService({});
      jest.spyOn(service as any, 'getRedisClient').mockResolvedValue(null);
      return service;
    }

    function session() {
      return {
        key: 'stream-key',
        namespaceId: 'namespace-id',
        finished: false,
        events: [] as string[],
        subscribers: [] as unknown[],
      };
    }

    it('replays the persisted error code', async () => {
      const service = replayableService();
      const target = session();

      await (service as any).sendSavedMessage(
        target,
        failedMessage({
          error_message:
            '本次请求未通过模型服务的安全审核，请修改相关内容后重试，或新建对话。',
          error_code: 'content_review_rejected',
        }),
        false,
      );

      expect(JSON.parse(target.events[target.events.length - 1])).toEqual({
        response_type: 'error',
        id: 'message-id',
        code: 'content_review_rejected',
        message:
          '本次请求未通过模型服务的安全审核，请修改相关内容后重试，或新建对话。',
      });
    });

    it('replays a legacy row that only has an error message', async () => {
      const service = replayableService();
      const target = session();

      await (service as any).sendSavedMessage(
        target,
        failedMessage({ error_message: 'fetch failed' }),
        false,
      );

      expect(JSON.parse(target.events[target.events.length - 1])).toEqual({
        response_type: 'error',
        id: 'message-id',
        message: 'fetch failed',
      });
    });
  });
});
