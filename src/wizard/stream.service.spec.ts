import { HttpStatus, MessageEvent } from '@nestjs/common';
import { AgentStream } from 'omniboxd/agent-stream-hooks/agent-stream-hooks.interface';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import {
  MessageStatus,
  OpenAIMessageRole,
} from 'omniboxd/messages/entities/message.entity';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import { ShareType } from 'omniboxd/shares/entities/share.entity';
import { StreamService } from 'omniboxd/wizard/stream.service';
import { Observable } from 'rxjs';

function createService(mocks: {
  configService?: { get: jest.Mock };
  wizardApiService?: Record<string, jest.Mock>;
  messagesService?: Record<string, jest.Mock>;
  conversationsService?: Record<string, jest.Mock>;
  visibleResourcesService?: Record<string, jest.Mock>;
  sharedResourcesService?: Record<string, jest.Mock>;
  resourcesService?: Record<string, jest.Mock>;
  traceService?: Record<string, jest.Mock>;
}) {
  return new StreamService(
    (mocks.configService ?? { get: jest.fn() }) as any,
    (mocks.wizardApiService ?? {
      resolveAgentTarget: jest
        .fn()
        .mockResolvedValue({ baseUrl: 'http://wizard', target: 'core' }),
    }) as any,
    (mocks.messagesService ?? {
      indexFinalAssistant: jest.fn().mockResolvedValue(undefined),
    }) as any,
    mocks.conversationsService as any,
    mocks.visibleResourcesService as any,
    mocks.sharedResourcesService as any,
    mocks.resourcesService as any,
    { t: jest.fn((key: string) => key) } as any,
    { mint: jest.fn(() => 'share-access-token') } as any,
    {
      onCallCompleted: jest.fn().mockResolvedValue(undefined),
      onStreamClosed: jest.fn().mockResolvedValue(undefined),
    } as any,
    mocks.traceService as any,
  );
}

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

describe('StreamService visible resource expansion gating', () => {
  const folderTool = {
    name: 'private_search',
    resources: [{ id: 'folder-id', name: 'Folder', type: 'folder' }],
  };

  const asUserMessage = (id: string) => ({
    id,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    parentId: null,
    message: { role: OpenAIMessageRole.USER, content: 'hello' },
    attrs: {},
  });

  function gatedService(mocks: Parameters<typeof createService>[0]) {
    const query = asUserMessage('query-id');
    const messagesService = {
      create: jest.fn().mockResolvedValue(query),
      findOne: jest.fn().mockResolvedValue(query),
      findAll: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue(query),
      updateDelta: jest.fn().mockResolvedValue({ message: {} }),
      setAnswerTiming: jest.fn().mockResolvedValue(undefined),
      indexFinalAssistant: jest.fn().mockResolvedValue(undefined),
      ...mocks.messagesService,
    };
    const service = createService({
      ...mocks,
      messagesService,
      conversationsService: {
        findOneForUserInNamespace: jest.fn().mockResolvedValue({}),
      },
    });
    jest
      .spyOn(service as any, 'resolveStreamParent')
      .mockResolvedValue(undefined);
    jest
      .spyOn(service as any, 'startRedisSession')
      .mockResolvedValue(undefined);
    jest.spyOn(service as any, 'getRedisClient').mockResolvedValue(null);
    jest.spyOn(service as any, 'isSessionCanceled').mockResolvedValue(false);
    return { service, messagesService };
  }

  async function runStream(
    mocks: Parameters<typeof createService>[0],
    body: Record<string, any>,
    mode: 'ask' | 'write' = 'ask',
  ) {
    const { service, messagesService } = gatedService(mocks);

    const observable = await service.createUserAgentStream(
      'user-id',
      'namespace-id',
      {
        conversation_id: 'conversation-id',
        query: 'hello',
        tools: [],
        ...body,
      } as any,
      'request-id',
      mode,
    );
    const chunks: any[] = [];
    await new Promise<void>((resolve) =>
      observable.subscribe({
        next: (event) => chunks.push(JSON.parse(event.data as string)),
        complete: resolve,
        error: resolve,
      }),
    );
    return { service, chunks, messagesService };
  }

  function wizardResponse() {
    return new Response('data: {"response_type":"done"}\n\n');
  }

  it('expands server-side for a core ask and passes it to the wizard', async () => {
    const resolveAgentTarget = jest.fn().mockResolvedValue({
      baseUrl: 'http://wizard',
      target: 'core',
    });
    const createAgentStream = jest.fn().mockResolvedValue(wizardResponse());
    const getVisibleResources = jest
      .fn()
      .mockResolvedValue([
        { id: 'expanded-id', name: 'Expanded', type: 'resource' },
      ]);
    await runStream(
      {
        wizardApiService: { resolveAgentTarget, createAgentStream },
        visibleResourcesService: { getVisibleResources },
      },
      { tools: [folderTool] },
    );

    expect(getVisibleResources).toHaveBeenCalledWith(
      'namespace-id',
      'user-id',
      folderTool.resources,
    );
    expect(createAgentStream).toHaveBeenCalledWith(
      'namespace-id',
      'ask',
      expect.objectContaining({
        tools: [
          expect.objectContaining({
            visible_resources: [
              { id: 'expanded-id', name: 'Expanded', type: 'resource' },
            ],
          }),
        ],
      }),
      'request-id',
      expect.any(AbortSignal),
      { baseUrl: 'http://wizard', target: 'core' },
    );
  });

  it('leaves an Agent 2.1 ask to the lazy resolver', async () => {
    const resolveAgentTarget = jest.fn().mockResolvedValue({
      baseUrl: 'http://wizard-pro',
      target: 'pro',
    });
    const createAgentStream = jest.fn().mockResolvedValue(wizardResponse());
    const getVisibleResources = jest.fn();
    await runStream(
      {
        wizardApiService: { resolveAgentTarget, createAgentStream },
        visibleResourcesService: { getVisibleResources },
      },
      { tools: [folderTool] },
    );

    expect(getVisibleResources).not.toHaveBeenCalled();
    const body = createAgentStream.mock.calls[0][2];
    expect(body.tools[0]).not.toHaveProperty('visible_resources');
    expect(createAgentStream).toHaveBeenCalledWith(
      'namespace-id',
      'ask',
      expect.anything(),
      'request-id',
      expect.any(AbortSignal),
      { baseUrl: 'http://wizard-pro', target: 'pro' },
    );
  });

  it('replaces a client-supplied list with the server expansion for a core ask', async () => {
    const clientResources = [
      { id: 'client-id', name: 'Client', type: 'resource' },
    ];
    const createAgentStream = jest.fn().mockResolvedValue(wizardResponse());
    const getVisibleResources = jest
      .fn()
      .mockResolvedValue([
        { id: 'server-id', name: 'Server', type: 'resource' },
      ]);
    await runStream(
      {
        wizardApiService: {
          resolveAgentTarget: jest
            .fn()
            .mockResolvedValue({ baseUrl: 'http://wizard', target: 'core' }),
          createAgentStream,
        },
        visibleResourcesService: { getVisibleResources },
      },
      {
        tools: [{ ...folderTool, visible_resources: clientResources }],
      },
    );

    const body = createAgentStream.mock.calls[0][2];
    expect(body.tools[0].visible_resources).toEqual([
      { id: 'server-id', name: 'Server', type: 'resource' },
    ]);
  });

  it('strips a client-supplied list from an Agent 2.1 ask', async () => {
    const createAgentStream = jest.fn().mockResolvedValue(wizardResponse());
    const getVisibleResources = jest.fn();
    await runStream(
      {
        wizardApiService: {
          resolveAgentTarget: jest
            .fn()
            .mockResolvedValue({ baseUrl: 'http://wizard-pro', target: 'pro' }),
          createAgentStream,
        },
        visibleResourcesService: { getVisibleResources },
      },
      {
        tools: [
          {
            ...folderTool,
            visible_resources: [
              { id: 'client-id', name: 'Client', type: 'resource' },
            ],
          },
        ],
      },
    );

    expect(getVisibleResources).not.toHaveBeenCalled();
    const body = createAgentStream.mock.calls[0][2];
    expect(body.tools[0]).not.toHaveProperty('visible_resources');
  });

  it('expands a write turn in openUserAgentStream without resolving a target', async () => {
    const resolveAgentTarget = jest.fn();
    const createAgentStream = jest.fn().mockResolvedValue(wizardResponse());
    const getVisibleResources = jest
      .fn()
      .mockResolvedValue([
        { id: 'expanded-id', name: 'Expanded', type: 'resource' },
      ]);
    await runStream(
      {
        wizardApiService: { resolveAgentTarget, createAgentStream },
        visibleResourcesService: { getVisibleResources },
      },
      { tools: [folderTool] },
      'write',
    );

    expect(resolveAgentTarget).not.toHaveBeenCalled();
    expect(getVisibleResources).toHaveBeenCalledWith(
      'namespace-id',
      'user-id',
      folderTool.resources,
    );
    const body = createAgentStream.mock.calls[0][2];
    expect(body.tools[0].visible_resources).toEqual([
      { id: 'expanded-id', name: 'Expanded', type: 'resource' },
    ]);
    expect(createAgentStream.mock.calls[0][5]).toBeUndefined();
  });

  it('does not expand a share turn a second time', async () => {
    const resolveAgentTarget = jest.fn();
    const createAgentStream = jest.fn().mockResolvedValue(wizardResponse());
    const getVisibleResources = jest.fn();
    const sharedResourcesService = {
      getAndValidateResource: jest.fn().mockResolvedValue({
        id: 'folder-id',
        resourceType: ResourceType.SMART_FOLDER,
      }),
      getSharedResourceChildren: jest.fn().mockResolvedValue([]),
    };
    const shareTool = {
      name: 'private_search',
      resources: [{ id: 'folder-id', name: 'Folder', type: 'folder' }],
    };
    const service = createService({
      wizardApiService: { resolveAgentTarget, createAgentStream },
      visibleResourcesService: { getVisibleResources },
      sharedResourcesService,
      messagesService: {
        create: jest.fn().mockResolvedValue(asUserMessage('query-id')),
        findOne: jest.fn().mockResolvedValue(asUserMessage('query-id')),
        findAll: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue(asUserMessage('query-id')),
        updateDelta: jest.fn().mockResolvedValue({ message: {} }),
        setAnswerTiming: jest.fn().mockResolvedValue(undefined),
        indexFinalAssistant: jest.fn().mockResolvedValue(undefined),
      },
    });
    jest
      .spyOn(service as any, 'resolveStreamParent')
      .mockResolvedValue(undefined);
    jest
      .spyOn(service as any, 'startRedisSession')
      .mockResolvedValue(undefined);
    jest.spyOn(service as any, 'getRedisClient').mockResolvedValue(null);
    jest.spyOn(service as any, 'isSessionCanceled').mockResolvedValue(false);

    const observable = await service.createShareAgentStream(
      {
        id: 'share-id',
        namespaceId: 'namespace-id',
        shareType: ShareType.ALL,
      } as any,
      {
        conversation_id: 'conversation-id',
        query: 'hello',
        tools: [shareTool],
      } as any,
      'request-id',
      'ask',
    );
    await new Promise<void>((resolve) =>
      observable.subscribe({ complete: resolve, error: resolve }),
    );

    expect(resolveAgentTarget).not.toHaveBeenCalled();
    expect(getVisibleResources).not.toHaveBeenCalled();
    expect(sharedResourcesService.getSharedResourceChildren).toHaveBeenCalled();
    expect(createAgentStream.mock.calls[0][2].tools).toEqual([
      {
        name: 'private_search',
        namespace_id: 'namespace-id',
        resources: [
          { id: 'folder-id', name: 'Folder', type: 'folder', child_ids: [] },
        ],
        visible_resources: [
          { id: 'folder-id', name: 'Folder', type: 'folder', child_ids: [] },
        ],
      },
    ]);
  });

  it('releases the turn when resolving the target fails', async () => {
    const resolveAgentTarget = jest
      .fn()
      .mockRejectedValue(
        new AppException('no credits', 'INSUFFICIENT_AGENT_CREDITS', 403),
      );
    const createAgentStream = jest.fn();
    const { service, chunks } = await runStream(
      {
        wizardApiService: { resolveAgentTarget, createAgentStream },
        visibleResourcesService: { getVisibleResources: jest.fn() },
      },
      { tools: [folderTool] },
    );

    expect(createAgentStream).not.toHaveBeenCalled();
    expect(chunks).toContainEqual(
      expect.objectContaining({
        response_type: 'error',
        code: 'INSUFFICIENT_AGENT_CREDITS',
        status: 403,
      }),
    );
    expect((service as any).agentStreamHooks.onStreamClosed).toHaveBeenCalled();
  });

  it('releases the turn when the server-side expansion fails', async () => {
    const createAgentStream = jest.fn();
    const { service, chunks } = await runStream(
      {
        wizardApiService: {
          resolveAgentTarget: jest
            .fn()
            .mockResolvedValue({ baseUrl: 'http://wizard', target: 'core' }),
          createAgentStream,
        },
        visibleResourcesService: {
          getVisibleResources: jest
            .fn()
            .mockRejectedValue(new Error('database down')),
        },
      },
      { tools: [folderTool] },
    );

    expect(createAgentStream).not.toHaveBeenCalled();
    expect(chunks).toContainEqual(
      expect.objectContaining({ response_type: 'error' }),
    );
    expect((service as any).agentStreamHooks.onStreamClosed).toHaveBeenCalled();
  });

  it('rejects the non-streaming open API turn with the preflight error', async () => {
    const notFound = new AppException(
      'Resource not found',
      'RESOURCE_NOT_FOUND',
      HttpStatus.NOT_FOUND,
    );
    const createAgentStream = jest.fn();
    const { service } = gatedService({
      wizardApiService: {
        resolveAgentTarget: jest
          .fn()
          .mockResolvedValue({ baseUrl: 'http://wizard', target: 'core' }),
        createAgentStream,
      },
      visibleResourcesService: {
        getVisibleResources: jest.fn().mockRejectedValue(notFound),
      },
    });

    const error = await service
      .chat(
        'user-id',
        'namespace-id',
        {
          conversation_id: 'conversation-id',
          query: 'hello',
          channel: 'open_api',
          tools: [folderTool],
        } as any,
        'request-id',
      )
      .then(
        () => {
          throw new Error('expected the chat to reject');
        },
        (reason: unknown) => reason,
      );

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe('RESOURCE_NOT_FOUND');
    expect((error as AppException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(createAgentStream).not.toHaveBeenCalled();
    expect((service as any).agentStreamHooks.onStreamClosed).toHaveBeenCalled();
  });

  it('leaves an in-stream wizard error to the chunk merge', async () => {
    const { service } = gatedService({
      wizardApiService: {
        resolveAgentTarget: jest
          .fn()
          .mockResolvedValue({ baseUrl: 'http://wizard', target: 'core' }),
        createAgentStream: jest
          .fn()
          .mockResolvedValue(
            new Response(
              'data: {"response_type":"error","message":"wizard failed"}\n\n',
            ),
          ),
      },
      visibleResourcesService: {
        getVisibleResources: jest.fn().mockResolvedValue([]),
      },
    });

    const chunks = await service.chat(
      'user-id',
      'namespace-id',
      {
        conversation_id: 'conversation-id',
        query: 'hello',
        channel: 'open_api',
        tools: [folderTool],
      } as any,
      'request-id',
    );

    const error = chunks.find((chunk: any) => chunk.response_type === 'error');
    expect(error).toMatchObject({
      response_type: 'error',
      message: 'wizard failed',
    });
    expect(error).not.toHaveProperty('status');
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
      hasChildren: jest.fn().mockResolvedValue(false),
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
      update: jest.fn(),
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
    expect(messagesService.update).not.toHaveBeenCalled();
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
      const update = jest.fn();
      const service = serviceWithMessages({
        findOneInConversation: jest.fn().mockResolvedValue(decision),
        findChildren: jest.fn().mockResolvedValue([toolResult]),
        update,
      });

      const error = await resolve(service, decisionsUnder('decision-d')).catch(
        (e: unknown) => e,
      );

      expect(error.getResponse()).toMatchObject({
        code: 'interrupt_already_decided',
        message_id: 'decision-d',
      });
      expect(update).not.toHaveBeenCalled();
    });

    it('resumes again a decision whose resume only left a failed reply', async () => {
      const stored = {
        ...decision,
        attrs: {
          tool_call: {
            decisions: [{ type: 'reject' }],
          },
        },
      };
      const service = serviceWithMessages({
        findOneInConversation: jest.fn().mockResolvedValue(stored),
        findChildren: jest.fn().mockResolvedValue([failedReply]),
        update: jest.fn((_id, _namespaceId, _conversationId, dto) =>
          Promise.resolve({ ...stored, attrs: dto.attrs }),
        ),
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
        const update = jest.fn();
        const service = serviceWithMessages({
          findOneInConversation: jest.fn().mockResolvedValue(decision),
          findChildren: jest.fn().mockResolvedValue([failedReply]),
          update,
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
        expect(update).not.toHaveBeenCalled();
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

    const rejectDecisions = [
      {
        type: 'reject',
        message: '用户没有批准这个操作，而是发送了新的消息，请不要重试该操作。',
        end_turn: true,
      },
      {
        type: 'reject',
        message: '用户没有批准这个操作，而是发送了新的消息，请不要重试该操作。',
        end_turn: true,
      },
    ];

    function storedDecision(decisions: object[]) {
      return {
        id: 'decision-d',
        parentId: 'interrupt-id',
        conversationId: 'conversation-id',
        message: { role: 'user', content: '' },
        attrs: {
          composer: { content: '' },
          context: { edition: 'pro' },
          tool_call: { decisions },
        },
      };
    }

    it('overwrites the stored decisions of a decision that was not applied', async () => {
      const stored = storedDecision([{ type: 'approve' }, { type: 'approve' }]);
      const update = jest.fn(
        (_id: string, _namespaceId: string, _conversationId: string, dto) =>
          Promise.resolve({ ...stored, attrs: dto.attrs }),
      );
      const service = serviceWithMessages({
        findOneInConversation: jest.fn().mockResolvedValue(stored),
        findChildren: jest.fn().mockResolvedValue([]),
        update,
      });

      await expect(
        resolve(service, {
          parent_message_id: 'decision-d',
          tool_call: { decisions: rejectDecisions },
        }),
      ).resolves.toBe('decision-d');

      expect(update).toHaveBeenCalledWith(
        'decision-d',
        'namespace-id',
        'conversation-id',
        {
          attrs: {
            composer: { content: '' },
            context: { edition: 'pro' },
            tool_call: { decisions: rejectDecisions },
          },
        },
        false,
      );
    });

    it('refuses a decision whose stored decision count does not match the request', async () => {
      const stored = storedDecision([{ type: 'approve' }, { type: 'approve' }]);
      const update = jest.fn();
      const service = serviceWithMessages({
        findOneInConversation: jest.fn().mockResolvedValue(stored),
        findChildren: jest.fn().mockResolvedValue([]),
        update,
      });

      const error = await resolve(service, {
        parent_message_id: 'decision-d',
        tool_call: { decisions: [{ type: 'reject', end_turn: true }] },
      }).catch((e: unknown) => e);

      expect(error).toMatchObject({ code: 'INVALID_DECISIONS' });
      expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(error.getResponse()).toMatchObject({
        code: 'invalid_decisions',
        message_id: 'decision-d',
      });
      expect(update).not.toHaveBeenCalled();
      expect(stored.attrs.tool_call.decisions).toEqual([
        { type: 'approve' },
        { type: 'approve' },
      ]);
    });

    function unlockedServiceWith(messagesService: Record<string, jest.Mock>) {
      const service = createService({ messagesService });
      jest.spyOn(service as any, 'getRedisClient').mockResolvedValue(null);
      return service;
    }

    it('applies the request decisions without a conversation lock', async () => {
      const stored = storedDecision([{ type: 'approve' }, { type: 'approve' }]);
      const update = jest.fn(
        (_id: string, _namespaceId: string, _conversationId: string, dto) =>
          Promise.resolve({ ...stored, attrs: dto.attrs }),
      );
      const service = unlockedServiceWith({
        findOneInConversation: jest.fn().mockResolvedValue(stored),
        findChildren: jest.fn().mockResolvedValue([]),
        update,
      });

      await expect(
        resolve(service, {
          parent_message_id: 'decision-d',
          tool_call: { decisions: rejectDecisions },
        }),
      ).resolves.toBe('decision-d');

      expect(update).toHaveBeenCalledTimes(1);
      expect(update).toHaveBeenCalledWith(
        'decision-d',
        'namespace-id',
        'conversation-id',
        {
          attrs: {
            composer: { content: '' },
            context: { edition: 'pro' },
            tool_call: { decisions: rejectDecisions },
          },
        },
        false,
      );
    });

    it('runs the question guards without a conversation lock and does not write', async () => {
      const findOneInConversation = jest.fn().mockResolvedValue({
        id: 'answer-1',
        message: { role: 'assistant' },
        attrs: {},
      });
      const update = jest.fn();
      const service = unlockedServiceWith({ findOneInConversation, update });

      await expect(
        resolve(service, { parent_message_id: 'answer-1', query: 'hello' }),
      ).resolves.toBe('answer-1');

      expect(findOneInConversation).toHaveBeenCalledWith(
        'answer-1',
        'conversation-id',
        'user-id',
      );
      expect(update).not.toHaveBeenCalled();
    });

    it('refuses text under an unapplied decision without a conversation lock', async () => {
      const create = jest.fn();
      const update = jest.fn();
      const service = unlockedServiceWith({
        findOneInConversation: jest
          .fn()
          .mockResolvedValue(storedDecision(rejectDecisions)),
        findChildren: jest.fn().mockResolvedValue([]),
        create,
        update,
      });

      const error = await resolve(service, {
        parent_message_id: 'decision-d',
        query: 'more text',
      }).catch((e: unknown) => e);

      expect(error.getResponse()).toMatchObject({
        code: 'decision_not_applied',
        message_id: 'decision-d',
      });
      expect(create).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });

    it('refuses text under a failed empty reply of an unapplied decision', async () => {
      const service = unlockedServiceWith({
        findOneInConversation: jest.fn((id: string) =>
          Promise.resolve(id === 'failed-f' ? failedReply : decision),
        ),
        findChildren: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      });

      const error = await resolve(service, {
        parent_message_id: 'failed-f',
        query: 'more text',
      }).catch((e: unknown) => e);

      expect(error.getResponse()).toMatchObject({
        code: 'decision_not_applied',
        message_id: 'decision-d',
      });
    });

    it('refuses text under a pending interrupt without a conversation lock', async () => {
      const service = unlockedServiceWith({
        findOneInConversation: jest.fn().mockResolvedValue(interruptMessage),
        create: jest.fn(),
        update: jest.fn(),
      });

      const error = await resolve(service, {
        parent_message_id: 'interrupt-id',
        query: 'more text',
      }).catch((e: unknown) => e);

      expect(error.getResponse()).toMatchObject({
        code: 'pending_interrupt',
        message_id: 'interrupt-id',
      });
    });

    it('rejects a question whose parent cannot be loaded without a lock', async () => {
      const service = unlockedServiceWith({
        findOneInConversation: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      });

      const error = await resolve(service, {
        parent_message_id: 'missing',
        query: 'hello',
      }).catch((e: unknown) => e);

      expect(error).toMatchObject({ code: 'PARENT_CONVERSATION_MISMATCH' });
    });

    it('follows the newest message below a stale parent without a lock', async () => {
      const raw = { id: 'question-1', message: { role: 'user' }, attrs: {} };
      const leaf = {
        id: 'answer-2',
        message: { role: 'assistant', content: '' },
        status: 'streaming',
        attrs: {},
      };
      const create = jest.fn();
      const update = jest.fn();
      const service = unlockedServiceWith({
        findOneInConversation: jest.fn().mockResolvedValue(raw),
        findLeafBelow: jest.fn().mockResolvedValue(leaf),
        create,
        update,
      });

      await expect(
        resolve(service, {
          parent_message_id: 'question-1',
          follow_latest: true,
          query: 'more text',
        }),
      ).resolves.toBe('answer-2');

      expect(create).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });

    it('keeps the raw parent when nothing sits below it without a lock', async () => {
      const raw = {
        id: 'answer-1',
        message: { role: 'assistant', content: 'hi' },
        attrs: {},
      };
      const service = unlockedServiceWith({
        findOneInConversation: jest.fn().mockResolvedValue(raw),
        findLeafBelow: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
      });

      await expect(
        resolve(service, {
          parent_message_id: 'answer-1',
          follow_latest: true,
          query: 'more text',
        }),
      ).resolves.toBe('answer-1');
    });

    it('refuses a followed leaf that is an unapplied decision without a lock', async () => {
      const raw = { id: 'answer-1', message: { role: 'assistant' }, attrs: {} };
      const create = jest.fn();
      const service = unlockedServiceWith({
        findOneInConversation: jest.fn().mockResolvedValue(raw),
        findLeafBelow: jest.fn().mockResolvedValue(decision),
        findChildren: jest.fn().mockResolvedValue([]),
        create,
        update: jest.fn(),
      });

      const error = await resolve(service, {
        parent_message_id: 'answer-1',
        follow_latest: true,
        query: 'more text',
      }).catch((e: unknown) => e);

      expect(error.getResponse()).toMatchObject({
        code: 'decision_not_applied',
        message_id: 'decision-d',
      });
      expect(create).not.toHaveBeenCalled();
    });

    it('ignores follow_latest for a decision resume without a lock', async () => {
      const stored = storedDecision([{ type: 'approve' }, { type: 'approve' }]);
      const findLeafBelow = jest.fn();
      const update = jest.fn(
        (_id: string, _namespaceId: string, _conversationId: string, dto) =>
          Promise.resolve({ ...stored, attrs: dto.attrs }),
      );
      const service = unlockedServiceWith({
        findOneInConversation: jest.fn().mockResolvedValue(stored),
        findChildren: jest.fn().mockResolvedValue([]),
        findLeafBelow,
        update,
      });

      await expect(
        resolve(service, {
          parent_message_id: 'decision-d',
          follow_latest: true,
          tool_call: { decisions: rejectDecisions },
        }),
      ).resolves.toBe('decision-d');

      expect(findLeafBelow).not.toHaveBeenCalled();
      expect(update).toHaveBeenCalledTimes(1);
    });

    it('refuses a decision resume while the conversation is streaming without a lock', async () => {
      const stored = storedDecision([{ type: 'approve' }, { type: 'approve' }]);
      const update = jest.fn();
      const service = unlockedServiceWith({
        findOneInConversation: jest.fn().mockResolvedValue(stored),
        findChildren: jest.fn().mockResolvedValue([]),
        update,
      });
      (service as any).streamSessions.set(
        'user:user-id:namespace-id:conversation-id',
        { finished: false },
      );

      const error = await resolve(service, {
        parent_message_id: 'decision-d',
        tool_call: { decisions: rejectDecisions },
      }).catch((e: unknown) => e);

      expect(error.getResponse()).toMatchObject({ code: 'conversation_busy' });
      expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
      expect(update).not.toHaveBeenCalled();
      expect(stored.attrs.tool_call.decisions).toEqual([
        { type: 'approve' },
        { type: 'approve' },
      ]);
    });

    it('reserves the stream while a no-lock decision write is in flight', async () => {
      const stored = storedDecision([{ type: 'approve' }, { type: 'approve' }]);
      let releaseUpdate!: () => void;
      const update = jest.fn(
        () =>
          new Promise((resolve) => {
            releaseUpdate = () =>
              resolve({
                ...stored,
                attrs: {
                  ...stored.attrs,
                  tool_call: { decisions: rejectDecisions },
                },
              });
          }),
      );
      const service = unlockedServiceWith({
        findOneInConversation: jest.fn().mockResolvedValue(stored),
        findChildren: jest.fn().mockResolvedValue([]),
        update,
      });

      const first = resolve(service, {
        parent_message_id: 'decision-d',
        tool_call: { decisions: rejectDecisions },
      });
      await new Promise((done) => setImmediate(done));
      expect(update).toHaveBeenCalledTimes(1);

      const second = await resolve(service, {
        parent_message_id: 'decision-d',
        tool_call: { decisions: rejectDecisions },
      }).catch((e: unknown) => e);

      expect(second.getResponse()).toMatchObject({ code: 'conversation_busy' });
      expect(update).toHaveBeenCalledTimes(1);

      releaseUpdate();
      await expect(first).resolves.toBe('decision-d');
      expect(update).toHaveBeenCalledTimes(1);
    });

    it('releases the reservation when the no-lock decision write fails', async () => {
      const stored = storedDecision([{ type: 'approve' }, { type: 'approve' }]);
      const update = jest
        .fn()
        .mockRejectedValueOnce(new Error('db down'))
        .mockResolvedValue({
          ...stored,
          attrs: { ...stored.attrs, tool_call: { decisions: rejectDecisions } },
        });
      const service = unlockedServiceWith({
        findOneInConversation: jest.fn().mockResolvedValue(stored),
        findChildren: jest.fn().mockResolvedValue([]),
        update,
      });

      await expect(
        resolve(service, {
          parent_message_id: 'decision-d',
          tool_call: { decisions: rejectDecisions },
        }),
      ).rejects.toThrow('db down');
      await expect(
        resolve(service, {
          parent_message_id: 'decision-d',
          tool_call: { decisions: rejectDecisions },
        }),
      ).resolves.toBe('decision-d');
      expect(update).toHaveBeenCalledTimes(2);
    });

    it('ignores an expired stream reservation', async () => {
      const stored = storedDecision([{ type: 'approve' }, { type: 'approve' }]);
      const update = jest.fn().mockResolvedValue({
        ...stored,
        attrs: { ...stored.attrs, tool_call: { decisions: rejectDecisions } },
      });
      const service = unlockedServiceWith({
        findOneInConversation: jest.fn().mockResolvedValue(stored),
        findChildren: jest.fn().mockResolvedValue([]),
        update,
      });
      (service as any).pendingStreamReservations.set(
        'user:user-id:namespace-id:conversation-id',
        { token: 'stale-owner', reservedAt: Date.now() - 120_000 },
      );

      await expect(
        resolve(service, {
          parent_message_id: 'decision-d',
          tool_call: { decisions: rejectDecisions },
        }),
      ).resolves.toBe('decision-d');
      expect(update).toHaveBeenCalledTimes(1);
    });

    it('reserves a no-lock latest decision resume', async () => {
      const stored = storedDecision([{ type: 'approve' }, { type: 'approve' }]);
      let releaseUpdate!: () => void;
      const update = jest.fn(
        () =>
          new Promise((resolve) => {
            releaseUpdate = () =>
              resolve({
                ...stored,
                attrs: {
                  ...stored.attrs,
                  tool_call: { decisions: rejectDecisions },
                },
              });
          }),
      );
      const service = unlockedServiceWith({
        findLatest: jest.fn().mockResolvedValue(stored),
        findChildren: jest.fn().mockResolvedValue([]),
        update,
      });

      const first = resolve(
        service,
        { tool_call: { decisions: rejectDecisions } },
        'latest',
      );
      await new Promise((done) => setImmediate(done));
      expect(update).toHaveBeenCalledTimes(1);

      const second = await resolve(
        service,
        { tool_call: { decisions: rejectDecisions } },
        'latest',
      ).catch((e: unknown) => e);
      expect(second.getResponse()).toMatchObject({ code: 'conversation_busy' });
      expect(update).toHaveBeenCalledTimes(1);

      releaseUpdate();
      await expect(first).resolves.toBe('decision-d');
    });

    it('keeps the conversation usable after a synchronous stream start failure', async () => {
      const stored = { ...storedDecision(rejectDecisions), parentId: null };
      const service = unlockedServiceWith({
        findOneInConversation: jest.fn().mockResolvedValue(stored),
        findChildren: jest.fn().mockResolvedValue([]),
        findAll: jest.fn().mockResolvedValue([stored]),
        update: jest.fn(),
      });

      const observable = await (service as any).createAgentStream(
        'namespace-id',
        {
          conversation_id: 'conversation-id',
          query: '',
          parent_message_id: 'decision-d',
          tools: { broken: true },
          channel: 'mobile',
          tool_call: { decisions: rejectDecisions },
        },
        'request-id',
        'ask',
        'user-id',
      );
      let error: unknown;
      await new Promise<void>((resolve) => {
        observable.subscribe({
          complete: resolve,
          error: (failure: unknown) => {
            error = failure;
            resolve();
          },
        });
      });

      expect(error).toBeInstanceOf(TypeError);
      expect((service as any).streamSessions.size).toBe(0);
      expect((service as any).pendingStreamReservations.size).toBe(0);
      await expect(
        resolve(service, {
          parent_message_id: 'decision-d',
          tool_call: { decisions: rejectDecisions },
        }),
      ).resolves.toBe('decision-d');
    });

    it('clears the claimed stream key when the start fails synchronously', async () => {
      const stored = { ...storedDecision(rejectDecisions), parentId: null };
      const del = jest.fn().mockResolvedValue(1);
      const set = jest.fn().mockResolvedValue('OK');
      const service = createService({});
      (service as any).messagesService = {
        findOneInConversation: jest.fn().mockResolvedValue(stored),
        findChildren: jest.fn().mockResolvedValue([]),
        findAll: jest.fn().mockResolvedValue([stored]),
        update: jest.fn(),
      };
      jest
        .spyOn(service, 'acquireConversationLock')
        .mockResolvedValue(jest.fn().mockResolvedValue(undefined));
      (service as any).redisClient = { isOpen: true, del, set };

      const observable = await (service as any).createAgentStream(
        'namespace-id',
        {
          conversation_id: 'conversation-id',
          query: '',
          parent_message_id: 'decision-d',
          tools: { broken: true },
          channel: 'mobile',
          tool_call: { decisions: rejectDecisions },
        },
        'request-id',
        'ask',
        'user-id',
      );
      let error: unknown;
      await new Promise<void>((resolve) => {
        observable.subscribe({
          complete: resolve,
          error: (failure: unknown) => {
            error = failure;
            resolve();
          },
        });
      });
      await new Promise((done) => setImmediate(done));

      expect(error).toBeInstanceOf(TypeError);
      expect(set).toHaveBeenCalledWith(
        'wizard:stream:user:user-id:namespace-id:conversation-id:active',
        '1',
        { EX: expect.any(Number) },
      );
      expect(del).toHaveBeenCalledWith(
        'wizard:stream:user:user-id:namespace-id:conversation-id:active',
      );
      await expect(
        resolve(service, {
          parent_message_id: 'decision-d',
          tool_call: { decisions: rejectDecisions },
        }),
      ).resolves.toBe('decision-d');
    });

    it('clears the claimed stream key when the post-check refuses', async () => {
      const raw = {
        id: 'answer-1',
        parentId: null,
        message: { role: 'assistant', content: 'hi' },
        attrs: {},
      };
      const del = jest.fn().mockResolvedValue(1);
      const set = jest.fn().mockResolvedValue('OK');
      const service = createService({});
      (service as any).messagesService = {
        findOneInConversation: jest.fn().mockResolvedValue(raw),
        findAll: jest.fn().mockResolvedValue([raw]),
        create: jest.fn(),
      };
      jest
        .spyOn(service, 'acquireConversationLock')
        .mockResolvedValue(jest.fn().mockResolvedValue(undefined));
      (service as any).redisClient = { isOpen: true, del, set };
      (service as any).streamSessions.set(
        'user:user-id:namespace-id:conversation-id',
        { finished: false },
      );

      await expect(
        (service as any).createAgentStream(
          'namespace-id',
          {
            conversation_id: 'conversation-id',
            query: 'text',
            parent_message_id: 'answer-1',
            tools: [],
            channel: 'mobile',
          },
          'request-id',
          'ask',
          'user-id',
        ),
      ).rejects.toMatchObject({ code: 'CONVERSATION_BUSY' });
      await new Promise((done) => setImmediate(done));

      expect(del).toHaveBeenCalledWith(
        'wizard:stream:user:user-id:namespace-id:conversation-id:active',
      );
    });

    it('refuses a same-key text start while a decision write is reserved', async () => {
      const key = 'user:user-id:namespace-id:conversation-id';
      const stored = storedDecision([{ type: 'approve' }, { type: 'approve' }]);
      let releaseUpdate!: () => void;
      const update = jest.fn(
        () =>
          new Promise((resolve) => {
            releaseUpdate = () =>
              resolve({
                ...stored,
                attrs: {
                  ...stored.attrs,
                  tool_call: { decisions: rejectDecisions },
                },
              });
          }),
      );
      const raw = {
        id: 'answer-1',
        parentId: null,
        message: { role: 'assistant', content: 'hi' },
        attrs: {},
      };
      const service = unlockedServiceWith({
        findOneInConversation: jest.fn((id: string) =>
          Promise.resolve(id === 'decision-d' ? stored : raw),
        ),
        findChildren: jest.fn().mockResolvedValue([]),
        findAll: jest.fn().mockResolvedValue([raw]),
        create: jest.fn(),
        update,
      });

      const first = resolve(service, {
        parent_message_id: 'decision-d',
        tool_call: { decisions: rejectDecisions },
      });
      await new Promise((done) => setImmediate(done));
      expect(update).toHaveBeenCalledTimes(1);
      expect((service as any).pendingStreamReservations.has(key)).toBe(true);

      await expect(
        (service as any).createAgentStream(
          'namespace-id',
          {
            conversation_id: 'conversation-id',
            query: 'text',
            parent_message_id: 'answer-1',
            tools: [],
            channel: 'mobile',
          },
          'request-text',
          'ask',
          'user-id',
        ),
      ).rejects.toMatchObject({ code: 'CONVERSATION_BUSY' });
      expect((service as any).streamSessions.size).toBe(0);

      releaseUpdate();
      await expect(first).resolves.toBe('decision-d');
      expect(update).toHaveBeenCalledTimes(1);
    });

    it('refuses a prepared text start once a decision resume holds the reservation', async () => {
      const key = 'user:user-id:namespace-id:conversation-id';
      const stored = storedDecision([{ type: 'approve' }, { type: 'approve' }]);
      const interrupt = {
        id: 'interrupt-id',
        parentId: null,
        message: { role: 'assistant', content: 'ask' },
        attrs: {},
      };
      const raw = {
        id: 'answer-1',
        parentId: null,
        message: { role: 'assistant', content: 'hi' },
        attrs: {},
      };
      const update = jest.fn(
        (
          _id: string,
          _namespaceId: string,
          _conversationId: string,
          dto: { attrs: object },
        ) => Promise.resolve({ ...stored, attrs: dto.attrs }),
      );
      const wizardStream = jest.fn<Promise<Response>, unknown[]>(
        () => new Promise<Response>(() => {}),
      );
      const service = unlockedServiceWith({
        findOneInConversation: jest.fn((id: string) =>
          Promise.resolve(id === 'decision-d' ? stored : raw),
        ),
        findChildren: jest.fn().mockResolvedValue([]),
        findAll: jest.fn().mockResolvedValue([raw, interrupt, stored]),
        update,
        create: jest.fn().mockResolvedValue({
          id: 'question-1',
          parentId: 'answer-1',
          status: 'success',
          message: { role: 'user', content: 'text' },
          attrs: {},
          createdAt: new Date(),
        }),
      });
      jest
        .spyOn(service as any, 'agentHandler')
        .mockReturnValue(jest.fn().mockResolvedValue(undefined));
      (service as any).wizardApiService = {
        resolveAgentTarget: jest
          .fn()
          .mockResolvedValue({ baseUrl: 'http://wizard-pro', target: 'pro' }),
        createAgentStream: wizardStream,
      };

      // Both requests pass the preparation check; neither has subscribed yet.
      const text = await (service as any).createAgentStream(
        'namespace-id',
        {
          conversation_id: 'conversation-id',
          query: 'text',
          parent_message_id: 'answer-1',
          tools: [],
          channel: 'mobile',
        },
        'request-text',
        'ask',
        'user-id',
      );
      const decision = await (service as any).createAgentStream(
        'namespace-id',
        {
          conversation_id: 'conversation-id',
          query: '',
          parent_message_id: 'decision-d',
          tools: [],
          channel: 'mobile',
          tool_call: { decisions: rejectDecisions },
        },
        'request-decision',
        'ask',
        'user-id',
      );
      expect((service as any).pendingStreamReservations.has(key)).toBe(true);

      const failures: unknown[] = [];
      text.subscribe({ error: (error: unknown) => failures.push(error) });
      expect(failures).toHaveLength(1);
      expect((failures[0] as AppException).getResponse()).toMatchObject({
        code: 'conversation_busy',
      });
      expect((service as any).streamSessions.size).toBe(0);
      expect((service as any).pendingStreamReservations.has(key)).toBe(true);

      decision.subscribe({});
      expect((service as any).streamSessions.has(key)).toBe(true);
      expect((service as any).pendingStreamReservations.has(key)).toBe(false);
      expect(update).toHaveBeenCalledTimes(1);

      await new Promise((done) => setImmediate(done));
      expect(wizardStream).toHaveBeenCalledTimes(1);
      expect(wizardStream.mock.calls[0][2]).toMatchObject({
        tool_call: { decisions: rejectDecisions },
      });
    });

    it('registers only the first of two prepared text starts', async () => {
      const key = 'user:user-id:namespace-id:conversation-id';
      const raw = {
        id: 'answer-1',
        parentId: null,
        message: { role: 'assistant', content: 'hi' },
        attrs: {},
      };
      const wizardStream = jest.fn<Promise<Response>, unknown[]>(
        () => new Promise<Response>(() => {}),
      );
      const service = unlockedServiceWith({
        findOneInConversation: jest.fn().mockResolvedValue(raw),
        findAll: jest.fn().mockResolvedValue([raw]),
        create: jest.fn().mockImplementation((...args: unknown[]) => {
          const body = args[3] as { message: { content: string } };
          return Promise.resolve({
            id: `question-${body.message.content}`,
            parentId: 'answer-1',
            status: 'success',
            message: { role: 'user', content: body.message.content },
            attrs: {},
            createdAt: new Date(),
          });
        }),
      });
      jest
        .spyOn(service as any, 'agentHandler')
        .mockReturnValue(jest.fn().mockResolvedValue(undefined));
      (service as any).wizardApiService = {
        resolveAgentTarget: jest
          .fn()
          .mockResolvedValue({ baseUrl: 'http://wizard-pro', target: 'pro' }),
        createAgentStream: wizardStream,
      };

      const first = await (service as any).createAgentStream(
        'namespace-id',
        {
          conversation_id: 'conversation-id',
          query: 'one',
          parent_message_id: 'answer-1',
          tools: [],
          channel: 'mobile',
        },
        'request-1',
        'ask',
        'user-id',
      );
      const second = await (service as any).createAgentStream(
        'namespace-id',
        {
          conversation_id: 'conversation-id',
          query: 'two',
          parent_message_id: 'answer-1',
          tools: [],
          channel: 'mobile',
        },
        'request-2',
        'ask',
        'user-id',
      );

      const failures: unknown[] = [];
      first.subscribe({ error: (error: unknown) => failures.push(error) });
      second.subscribe({ error: (error: unknown) => failures.push(error) });
      expect(failures).toHaveLength(1);
      expect((failures[0] as AppException).getResponse()).toMatchObject({
        code: 'conversation_busy',
      });
      expect((service as any).streamSessions.has(key)).toBe(true);
      expect((service as any).streamSessions.size).toBe(1);

      await new Promise((done) => setImmediate(done));
      expect(wizardStream).toHaveBeenCalledTimes(1);
      expect(wizardStream.mock.calls[0][2]).toMatchObject({ query: 'one' });
    });

    it('does not release a newer reservation with a stale owner token', async () => {
      const key = 'user:user-id:namespace-id:conversation-id';
      const stored = storedDecision([{ type: 'approve' }, { type: 'approve' }]);
      let rejectUpdate!: (error: Error) => void;
      const update = jest.fn(
        () =>
          new Promise((_resolve, reject) => {
            rejectUpdate = reject;
          }),
      );
      const service = unlockedServiceWith({
        findOneInConversation: jest.fn().mockResolvedValue(stored),
        findChildren: jest.fn().mockResolvedValue([]),
        update,
      });

      const first = resolve(service, {
        parent_message_id: 'decision-d',
        tool_call: { decisions: rejectDecisions },
      });
      await new Promise((done) => setImmediate(done));
      const owner = (service as any).pendingStreamReservations.get(key);
      expect(owner?.token).toEqual(expect.any(String));
      const newer = { token: 'newer-owner', reservedAt: Date.now() };
      (service as any).pendingStreamReservations.set(key, newer);

      rejectUpdate(new Error('db down'));
      await expect(first).rejects.toThrow('db down');
      expect((service as any).pendingStreamReservations.get(key)).toEqual(
        newer,
      );
    });

    it('clears the claimed stream key when the lock release fails', async () => {
      const raw = {
        id: 'answer-1',
        parentId: null,
        message: { role: 'assistant', content: 'hi' },
        attrs: {},
      };
      const del = jest.fn().mockResolvedValue(1);
      const set = jest.fn().mockResolvedValue('OK');
      const service = createService({});
      (service as any).messagesService = {
        findOneInConversation: jest.fn().mockResolvedValue(raw),
        findAll: jest.fn().mockResolvedValue([raw]),
        create: jest.fn(),
      };
      jest
        .spyOn(service, 'acquireConversationLock')
        .mockResolvedValue(
          jest.fn().mockRejectedValue(new Error('lock release failed')),
        );
      (service as any).redisClient = { isOpen: true, del, set };

      await expect(
        (service as any).createAgentStream(
          'namespace-id',
          {
            conversation_id: 'conversation-id',
            query: 'text',
            parent_message_id: 'answer-1',
            tools: [],
            channel: 'mobile',
          },
          'request-id',
          'ask',
          'user-id',
        ),
      ).rejects.toThrow('lock release failed');
      await new Promise((done) => setImmediate(done));

      const activeKey =
        'wizard:stream:user:user-id:namespace-id:conversation-id:active';
      expect(set).toHaveBeenCalledWith(activeKey, '1', {
        EX: expect.any(Number),
      });
      expect(del).toHaveBeenCalledWith(activeKey);
    });

    it('does not clear another request key after a no-op claim', async () => {
      const key = 'user:user-id:namespace-id:conversation-id';
      const raw = {
        id: 'answer-1',
        parentId: null,
        message: { role: 'assistant', content: 'hi' },
        attrs: {},
      };
      let resolveFindAll!: (value: object[]) => void;
      const findAll = jest.fn(
        () =>
          new Promise<object[]>((resolve) => {
            resolveFindAll = resolve;
          }),
      );
      const del = jest.fn().mockResolvedValue(1);
      const service = createService({});
      (service as any).messagesService = {
        findOneInConversation: jest.fn().mockResolvedValue(raw),
        findAll,
        create: jest.fn(),
      };
      (service as any).streamSessions.set(key, { finished: false });

      const pending = (service as any)
        .createAgentStream(
          'namespace-id',
          {
            conversation_id: 'conversation-id',
            query: 'text',
            parent_message_id: 'answer-1',
            tools: [],
            channel: 'mobile',
          },
          'request-id',
          'ask',
          'user-id',
        )
        .catch((error: unknown) => error);
      await new Promise((done) => setImmediate(done));
      // Redis recovered after this request's claim was a no-op.
      (service as any).redisClient = { isOpen: true, del, set: jest.fn() };
      resolveFindAll([raw]);

      const error = await pending;
      expect(error).toMatchObject({ code: 'CONVERSATION_BUSY' });
      await new Promise((done) => setImmediate(done));
      expect(del).not.toHaveBeenCalled();
    });

    it('ignores an expired reservation on a text start', async () => {
      const key = 'user:user-id:namespace-id:conversation-id';
      const raw = {
        id: 'answer-1',
        parentId: null,
        message: { role: 'assistant', content: 'hi' },
        attrs: {},
      };
      const service = unlockedServiceWith({
        findOneInConversation: jest.fn().mockResolvedValue(raw),
        findAll: jest.fn().mockResolvedValue([raw]),
        create: jest.fn(),
      });
      (service as any).pendingStreamReservations.set(key, {
        token: 'expired-owner',
        reservedAt: Date.now() - 120_000,
      });

      await expect(
        (service as any).createAgentStream(
          'namespace-id',
          {
            conversation_id: 'conversation-id',
            query: 'text',
            parent_message_id: 'answer-1',
            tools: [],
            channel: 'mobile',
          },
          'request-id',
          'ask',
          'user-id',
        ),
      ).resolves.toBeDefined();
      expect((service as any).pendingStreamReservations.has(key)).toBe(false);
    });

    it('refuses a locked decision resume while a foreign reservation is pending', async () => {
      const key = 'user:user-id:namespace-id:conversation-id';
      const stored = storedDecision([{ type: 'approve' }, { type: 'approve' }]);
      const update = jest.fn();
      const service = serviceWithMessages({
        findOneInConversation: jest.fn().mockResolvedValue(stored),
        findChildren: jest.fn().mockResolvedValue([]),
        update,
      });
      (service as any).pendingStreamReservations.set(key, {
        token: 'foreign-owner',
        reservedAt: Date.now(),
      });

      const error = await resolve(service, {
        parent_message_id: 'decision-d',
        tool_call: { decisions: rejectDecisions },
      }).catch((e: unknown) => e);

      expect(error.getResponse()).toMatchObject({ code: 'conversation_busy' });
      expect(update).not.toHaveBeenCalled();
    });

    it('ignores an expired reservation on a locked decision resume', async () => {
      const key = 'user:user-id:namespace-id:conversation-id';
      const stored = storedDecision([{ type: 'approve' }, { type: 'approve' }]);
      const update = jest.fn().mockResolvedValue({
        ...stored,
        attrs: { ...stored.attrs, tool_call: { decisions: rejectDecisions } },
      });
      const service = serviceWithMessages({
        findOneInConversation: jest.fn().mockResolvedValue(stored),
        findChildren: jest.fn().mockResolvedValue([]),
        update,
      });
      (service as any).pendingStreamReservations.set(key, {
        token: 'expired-owner',
        reservedAt: Date.now() - 120_000,
      });

      await expect(
        resolve(service, {
          parent_message_id: 'decision-d',
          tool_call: { decisions: rejectDecisions },
        }),
      ).resolves.toBe('decision-d');
      expect(update).toHaveBeenCalledTimes(1);
    });

    it('releases the reservation when the stream cannot be created', async () => {
      const stored = storedDecision(rejectDecisions);
      const service = unlockedServiceWith({
        findOneInConversation: jest.fn().mockResolvedValue(stored),
        findChildren: jest.fn().mockResolvedValue([]),
        findAll: jest.fn().mockRejectedValue(new Error('db down')),
        update: jest.fn(),
      });

      await expect(
        (service as any).createAgentStream(
          'namespace-id',
          {
            conversation_id: 'conversation-id',
            query: '',
            parent_message_id: 'decision-d',
            tools: [],
            channel: 'mobile',
            tool_call: { decisions: rejectDecisions },
          },
          'request-id',
          'ask',
          'user-id',
        ),
      ).rejects.toThrow('db down');
      expect((service as any).pendingStreamReservations.size).toBe(0);
    });

    it('refuses a decision resume while the conversation is streaming under the lock', async () => {
      const stored = storedDecision([{ type: 'approve' }, { type: 'approve' }]);
      const update = jest.fn();
      const service = serviceWithMessages({
        findOneInConversation: jest.fn().mockResolvedValue(stored),
        findChildren: jest.fn().mockResolvedValue([]),
        update,
      });
      (service as any).streamSessions.set(
        'user:user-id:namespace-id:conversation-id',
        { finished: false },
      );

      const error = await resolve(service, {
        parent_message_id: 'decision-d',
        tool_call: { decisions: rejectDecisions },
      }).catch((e: unknown) => e);

      expect(error.getResponse()).toMatchObject({ code: 'conversation_busy' });
      expect(update).not.toHaveBeenCalled();
    });

    it('refuses a decided resume without a conversation lock and does not write', async () => {
      const update = jest.fn();
      const service = unlockedServiceWith({
        findOneInConversation: jest
          .fn()
          .mockResolvedValue(storedDecision(rejectDecisions)),
        findChildren: jest.fn().mockResolvedValue([toolResult]),
        update,
      });

      const error = await resolve(service, {
        parent_message_id: 'decision-d',
        tool_call: { decisions: rejectDecisions },
      }).catch((e: unknown) => e);

      expect(error.getResponse()).toMatchObject({
        code: 'interrupt_already_decided',
        message_id: 'decision-d',
      });
      expect(update).not.toHaveBeenCalled();
    });

    it('refuses a decided interrupt without a conversation lock and does not write', async () => {
      const interrupt = {
        id: 'interrupt-id',
        conversationId: 'conversation-id',
        message: { role: 'assistant' },
        attrs: { tool_call: { interrupts: [{ id: 'call-1' }] } },
      };
      const update = jest.fn();
      const service = unlockedServiceWith({
        findOneInConversation: jest.fn().mockResolvedValue(interrupt),
        hasChildren: jest.fn().mockResolvedValue(true),
        update,
      });

      const error = await resolve(service, {
        parent_message_id: 'interrupt-id',
        tool_call: { decisions: rejectDecisions },
      }).catch((e: unknown) => e);

      expect(error.getResponse()).toMatchObject({
        code: 'interrupt_already_decided',
        message_id: 'interrupt-id',
      });
      expect(update).not.toHaveBeenCalled();
    });

    it('rejects a decision whose parent cannot be loaded without a lock', async () => {
      const service = unlockedServiceWith({
        findOneInConversation: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      });

      const error = await resolve(service, {
        parent_message_id: 'missing',
        tool_call: { decisions: rejectDecisions },
      }).catch((e: unknown) => e);

      expect(error).toMatchObject({ code: 'PARENT_CONVERSATION_MISMATCH' });
      expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    });

    it('does not write a decision whose stored decisions match the request', async () => {
      const stored = storedDecision(rejectDecisions);
      const update = jest.fn();
      const service = serviceWithMessages({
        findOneInConversation: jest.fn().mockResolvedValue(stored),
        findChildren: jest.fn().mockResolvedValue([]),
        update,
      });

      await expect(
        resolve(service, {
          parent_message_id: 'decision-d',
          tool_call: { decisions: rejectDecisions },
        }),
      ).resolves.toBe('decision-d');

      expect(update).not.toHaveBeenCalled();
    });

    it('overwrites an unapplied decision resolved as the latest message', async () => {
      const stored = storedDecision([{ type: 'approve' }]);
      const update = jest.fn(
        (_id: string, _namespaceId: string, _conversationId: string, dto) =>
          Promise.resolve({ ...stored, attrs: dto.attrs }),
      );
      const service = serviceWithMessages({
        findLatest: jest.fn().mockResolvedValue(stored),
        findChildren: jest.fn().mockResolvedValue([]),
        update,
      });

      await expect(
        resolve(
          service,
          { tool_call: { decisions: [{ type: 'reject', end_turn: true }] } },
          'latest',
        ),
      ).resolves.toBe('decision-d');

      expect(update).toHaveBeenCalledWith(
        'decision-d',
        'namespace-id',
        'conversation-id',
        {
          attrs: {
            composer: { content: '' },
            context: { edition: 'pro' },
            tool_call: { decisions: [{ type: 'reject', end_turn: true }] },
          },
        },
        false,
      );
    });

    it('keeps the in-memory parent in sync with the saved attrs', async () => {
      const stored = storedDecision([{ type: 'approve' }, { type: 'approve' }]);
      const update = jest.fn(
        (_id: string, _namespaceId: string, _conversationId: string, dto) =>
          Promise.resolve({
            ...stored,
            attrs: { ...dto.attrs, saved_marker: true },
          }),
      );
      const service = serviceWithMessages({
        findOneInConversation: jest.fn().mockResolvedValue(stored),
        findChildren: jest.fn().mockResolvedValue([]),
        update,
      });

      await resolve(service, {
        parent_message_id: 'decision-d',
        tool_call: { decisions: rejectDecisions },
      });

      expect(stored.attrs).toEqual({
        composer: { content: '' },
        context: { edition: 'pro' },
        tool_call: { decisions: rejectDecisions },
        saved_marker: true,
      });
    });

    it('overwrites an unapplied decision in a share stream', async () => {
      const stored = {
        ...storedDecision([{ type: 'approve' }, { type: 'approve' }]),
        parentId: null,
      };
      const update = jest.fn(
        (_id: string, _namespaceId: string, _conversationId: string, dto) =>
          Promise.resolve({ ...stored, attrs: dto.attrs }),
      );
      const messagesService = {
        findOneInConversation: jest.fn().mockResolvedValue(stored),
        findChildren: jest.fn().mockResolvedValue([]),
        findAll: jest.fn().mockResolvedValue([stored]),
        update,
      };
      const service = createService({ messagesService });
      jest
        .spyOn(service, 'acquireConversationLock')
        .mockResolvedValue(jest.fn().mockResolvedValue(undefined));
      jest
        .spyOn(service as any, 'claimStreamActive')
        .mockResolvedValue(undefined);

      await service.createShareAgentStream(
        {
          id: 'share-id',
          namespaceId: 'namespace-id',
          shareType: ShareType.ALL,
        } as any,
        {
          conversation_id: 'conversation-id',
          parent_message_id: 'decision-d',
          query: 'hello',
          tools: [],
          tool_call: { decisions: rejectDecisions },
        } as any,
        'request-id',
        'ask',
      );

      expect(update).toHaveBeenCalledWith(
        'decision-d',
        'namespace-id',
        'conversation-id',
        {
          attrs: {
            composer: { content: '' },
            context: { edition: 'pro' },
            tool_call: { decisions: rejectDecisions },
          },
        },
        false,
      );
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
      expect.any(Number),
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
      {
        resolveAgentTarget: jest
          .fn()
          .mockResolvedValue({ baseUrl: 'http://wizard', target: 'pro' }),
        createAgentStream: jest.fn().mockResolvedValue(response),
      } as never,
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
      {
        resolveAgentTarget: jest
          .fn()
          .mockResolvedValue({ baseUrl: 'http://wizard', target: 'pro' }),
        createAgentStream: jest.fn().mockResolvedValue(response),
      } as never,
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
      findOneInConversation: jest.fn().mockResolvedValue(query),
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
      findOneInConversation: jest.fn().mockResolvedValue(interrupt),
      hasChildren: jest.fn().mockResolvedValue(false),
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
    expect((service as any).pendingStreamReservations.size).toBe(0);
  });
});

describe('StreamService composer images', () => {
  const image = {
    attachment_id: '6ba7b810-9dad-41d1-80b4-00c04fd430c8',
    url: '/api/v1/namespaces/client-ns/conversations/client-conversation/attachments/client-attachment',
    name: 'image.jpg',
  };

  function serviceWithMessages() {
    const service = createService({});
    const create = jest.fn().mockResolvedValue({
      id: 'query-id',
      parentId: null,
      createdAt: new Date('2026-11-16T00:00:00.000Z'),
      message: { role: 'user', content: 'hello' },
      attrs: {},
    });
    (service as any).messagesService = {
      create,
      findOne: jest.fn().mockResolvedValue({ attrs: {} }),
      indexFinalAssistant: jest.fn().mockResolvedValue(undefined),
    };
    return { service, create };
  }

  async function run(service: StreamService, body: Record<string, unknown>) {
    const observable = await (service as any).createAgentStream(
      'namespace-id',
      {
        query: 'hello',
        conversation_id: 'conversation-id',
        tools: [],
        ...body,
      },
      'req',
      'ask',
      'user-id',
    );
    await new Promise<void>((resolve, reject) =>
      observable.subscribe({ complete: resolve, error: reject }),
    );
  }

  it('stores text and image display parts and forwards the images to the wizard', async () => {
    const { service, create } = serviceWithMessages();
    const wizardRequests: Record<string, any>[] = [];
    jest.spyOn(service, 'stream').mockImplementation((_ns, _mode, request) => {
      wizardRequests.push(request);
      return Promise.resolve();
    });

    await run(service, { images: [image] });

    expect(create.mock.calls[0][3].attrs.composer).toEqual({
      display_parts: [
        { type: 'text', text: 'hello' },
        {
          type: 'image',
          attachment_id: image.attachment_id,
          name: image.name,
          preview_url: `/api/v1/namespaces/namespace-id/conversations/conversation-id/attachments/${image.attachment_id}`,
        },
      ],
    });
    expect(wizardRequests[0].images).toEqual([image]);
  });

  it('does not write a composer without images', async () => {
    const { service, create } = serviceWithMessages();
    jest.spyOn(service, 'stream').mockResolvedValue(undefined);

    await run(service, {});

    expect(create.mock.calls[0][3].attrs).not.toHaveProperty('composer');
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
        ...(location === 'local' ? [undefined, undefined] : []),
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

  describe('replay of a saved message context', () => {
    const savedMessage = () => ({
      id: 'message-id',
      parentId: 'parent-id',
      conversationId: 'conversation-id',
      status: MessageStatus.SUCCESS,
      createdAt: new Date('2026-11-11T08:00:00.000Z'),
      message: { role: 'assistant', content: 'answer' },
      attrs: {
        answer_timing: { started_at: '2026-11-11T08:00:00.000Z' },
        citations: [{ title: 'citation' }],
        usage: { prompt_tokens: 10 },
        compact: { status: 'compacted' },
        context: {
          provider: 'agent_pro',
          call: { chain_id: 'chain-1' },
          checkpoint: { context_snapshot: { version: 1 } },
        },
      },
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
        userId: 'user-id',
        finished: false,
        events: [] as string[],
        subscribers: [] as unknown[],
      };
    }

    it('drops context from replay chunks and leaves the stored attrs alone', async () => {
      const service = replayableService();
      const target = session();
      const saved = savedMessage();

      await (service as any).sendSavedMessage(target, saved, false);

      const chunks = target.events.map((event) => JSON.parse(event));
      expect(chunks.map((chunk) => chunk.response_type)).toEqual([
        'bos',
        'delta',
        'eos',
      ]);
      for (const chunk of chunks.slice(0, 2)) {
        expect(chunk.attrs).toEqual({
          answer_timing: saved.attrs.answer_timing,
          citations: saved.attrs.citations,
          usage: saved.attrs.usage,
          compact: saved.attrs.compact,
        });
        expect('context' in chunk.attrs).toBe(false);
      }
      expect(chunks[2]).not.toHaveProperty('attrs');

      expect(saved.attrs.context).toEqual({
        provider: 'agent_pro',
        call: { chain_id: 'chain-1' },
        checkpoint: { context_snapshot: { version: 1 } },
      });
      expect(saved.attrs.citations).toEqual([{ title: 'citation' }]);
    });

    it('drops context for chat-only replay and keeps the other filters', async () => {
      const service = replayableService();
      const target = session();

      await (service as any).sendSavedMessage(target, savedMessage(), true);

      const [bos, delta] = target.events.map((event) => JSON.parse(event));
      for (const chunk of [bos, delta]) {
        expect(chunk.attrs).toEqual({
          answer_timing: { started_at: '2026-11-11T08:00:00.000Z' },
          usage: { prompt_tokens: 10 },
          compact: { status: 'compacted' },
        });
        expect('context' in chunk.attrs).toBe(false);
        expect('citations' in chunk.attrs).toBe(false);
      }
    });
  });
});

describe('StreamService first content token trace', () => {
  function handlerFixture() {
    const rows = new Map<string, Record<string, any>>();
    let sequence = 0;
    const messagesService = {
      findOne: jest.fn().mockResolvedValue({ attrs: {} }),
      create: jest.fn(
        (_n: string, conversationId: string, _u: string, dto: any) => {
          const row: Record<string, any> = {
            id: `message-${++sequence}`,
            conversationId,
            parentId: dto.parentId ?? null,
            createdAt: new Date(),
            status: MessageStatus.PENDING,
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
      update: jest.fn((id: string, _n: string, _c: string, dto: any) => {
        const row = rows.get(id)!;
        Object.assign(row, dto);
        return Promise.resolve(row);
      }),
      indexFinalAssistant: jest.fn().mockResolvedValue(undefined),
    };
    const traceService = {
      emitTraceEvents: jest.fn().mockResolvedValue(undefined),
    };
    const service = createService({ messagesService, traceService });
    let now = 1000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const context: Record<string, any> = {
      runId: 'run-id',
      queryId: 'query-id',
      queryReceivedAt: 1000,
      channel: 'web',
      mode: 'ask',
    };
    const handler = service.agentHandler(
      'namespace-id',
      'conversation-id',
      'user-id',
      jest.fn().mockResolvedValue(undefined),
    );
    const emitAt = async (at: number, chunk: Record<string, any>) => {
      now = at;
      await handler(JSON.stringify(chunk), context);
    };
    const events = () =>
      traceService.emitTraceEvents.mock.calls
        .flatMap(([list]) => list)
        .filter((event: any) => event.name === 'chat_first_content_token');
    return { rows, traceService, context, emitAt, events };
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reports the query to first content token timing for a single round', async () => {
    const { rows, traceService, emitAt, events } = handlerFixture();

    await emitAt(1100, {
      response_type: 'bos',
      role: OpenAIMessageRole.ASSISTANT,
    });
    await emitAt(1200, {
      response_type: 'delta',
      message: { content: 'answer' },
    });
    await emitAt(1300, { response_type: 'eos' });
    await emitAt(1400, { response_type: 'done' });

    expect(traceService.emitTraceEvents).toHaveBeenCalledTimes(1);
    const reported = events();
    expect(reported).toHaveLength(1);
    expect(reported[0].props).toEqual({
      schema_version: 1,
      conversation_id: 'conversation-id',
      request_id: 'run-id',
      query_message_id: 'query-id',
      answer_message_id: rows.get('message-1')!.id,
      channel: 'web',
      mode: 'ask',
      query_received_at: 1000,
      first_content_token_at: 1200,
      first_content_token_latency_ms: 200,
      source: 'server',
    });
  });

  it('uses the final round content token across a tool round', async () => {
    const { emitAt, events } = handlerFixture();

    await emitAt(1100, {
      response_type: 'bos',
      role: OpenAIMessageRole.ASSISTANT,
    });
    await emitAt(1200, {
      response_type: 'delta',
      message: { content: 'early answer' },
    });
    await emitAt(1250, {
      response_type: 'delta',
      message: { tool_calls: [{ id: 'call-1' }] },
    });
    await emitAt(1300, { response_type: 'eos' });
    await emitAt(1400, {
      response_type: 'bos',
      role: OpenAIMessageRole.TOOL,
    });
    await emitAt(1500, {
      response_type: 'delta',
      message: { content: 'tool output' },
    });
    await emitAt(1600, { response_type: 'eos' });
    await emitAt(1700, {
      response_type: 'bos',
      role: OpenAIMessageRole.ASSISTANT,
    });
    await emitAt(1800, {
      response_type: 'delta',
      message: { reasoning_content: 'thinking' },
    });
    await emitAt(1900, {
      response_type: 'delta',
      message: { content: 'final answer' },
    });
    await emitAt(2000, { response_type: 'eos' });
    await emitAt(2100, { response_type: 'done' });

    const reported = events();
    expect(reported).toHaveLength(1);
    expect(reported[0].props.first_content_token_at).toBe(1900);
    expect(reported[0].props.first_content_token_latency_ms).toBe(900);
  });

  it('does not report when only an earlier round has content', async () => {
    const { emitAt, events } = handlerFixture();

    await emitAt(1100, {
      response_type: 'bos',
      role: OpenAIMessageRole.ASSISTANT,
    });
    await emitAt(1200, {
      response_type: 'delta',
      message: { content: 'early answer' },
    });
    await emitAt(1300, { response_type: 'eos' });
    await emitAt(1400, {
      response_type: 'bos',
      role: OpenAIMessageRole.ASSISTANT,
    });
    await emitAt(1500, {
      response_type: 'delta',
      message: { reasoning_content: 'thinking' },
    });
    await emitAt(1600, { response_type: 'eos' });
    await emitAt(1700, { response_type: 'done' });

    expect(events()).toHaveLength(0);
  });

  it('ignores content on a trailing tool message', async () => {
    const { emitAt, events } = handlerFixture();

    await emitAt(1100, {
      response_type: 'bos',
      role: OpenAIMessageRole.ASSISTANT,
    });
    await emitAt(1200, {
      response_type: 'delta',
      message: { content: 'partial answer' },
    });
    await emitAt(1300, { response_type: 'eos' });
    await emitAt(1400, {
      response_type: 'bos',
      role: OpenAIMessageRole.TOOL,
    });
    await emitAt(1500, {
      response_type: 'delta',
      message: { content: 'tool output' },
    });
    await emitAt(1600, { response_type: 'eos' });
    await emitAt(1700, { response_type: 'done' });

    expect(events()).toHaveLength(0);
  });

  it('ignores reasoning content before the answer body', async () => {
    const { emitAt, events } = handlerFixture();

    await emitAt(1100, {
      response_type: 'bos',
      role: OpenAIMessageRole.ASSISTANT,
    });
    await emitAt(1200, {
      response_type: 'delta',
      message: { reasoning_content: 'thinking' },
    });
    await emitAt(1300, {
      response_type: 'delta',
      message: { content: 'answer' },
    });
    await emitAt(1400, { response_type: 'eos' });
    await emitAt(1500, { response_type: 'done' });

    const reported = events();
    expect(reported).toHaveLength(1);
    expect(reported[0].props.first_content_token_at).toBe(1300);
  });

  it('does not report an assistant round without content', async () => {
    const { emitAt, events } = handlerFixture();

    await emitAt(1100, {
      response_type: 'bos',
      role: OpenAIMessageRole.ASSISTANT,
    });
    await emitAt(1200, {
      response_type: 'delta',
      message: { reasoning_content: 'thinking' },
    });
    await emitAt(1300, { response_type: 'eos' });
    await emitAt(1400, { response_type: 'done' });

    expect(events()).toHaveLength(0);
  });

  it('does not report a failed run that still receives done', async () => {
    const { traceService, emitAt, events } = handlerFixture();

    await emitAt(1100, {
      response_type: 'bos',
      role: OpenAIMessageRole.ASSISTANT,
    });
    await emitAt(1200, {
      response_type: 'delta',
      message: { content: 'partial answer' },
    });
    await emitAt(1300, { response_type: 'error', message: 'boom' });
    await emitAt(1400, { response_type: 'done' });

    expect(events()).toHaveLength(0);
    // The error trace path is independent of the new event.
    expect(
      traceService.emitTraceEvents.mock.calls
        .flatMap(([list]) => list)
        .filter((event: any) => event.name === 'chat_error'),
    ).toHaveLength(1);
  });

  it('does not report an interrupted run', async () => {
    const { emitAt, events } = handlerFixture();

    await emitAt(1100, {
      response_type: 'bos',
      role: OpenAIMessageRole.ASSISTANT,
    });
    await emitAt(1200, {
      response_type: 'delta',
      message: { content: 'partial answer' },
      attrs: { tool_call: { interrupts: [{ id: 'interrupt-id' }] } },
    });
    await emitAt(1300, { response_type: 'eos' });
    await emitAt(1400, { response_type: 'done' });

    expect(events()).toHaveLength(0);
  });

  it('reports only once when done arrives twice', async () => {
    const { emitAt, events } = handlerFixture();

    await emitAt(1100, {
      response_type: 'bos',
      role: OpenAIMessageRole.ASSISTANT,
    });
    await emitAt(1200, {
      response_type: 'delta',
      message: { content: 'answer' },
    });
    await emitAt(1300, { response_type: 'eos' });
    await emitAt(1400, { response_type: 'done' });
    await emitAt(1500, { response_type: 'done' });

    expect(events()).toHaveLength(1);
  });

  it('does not report without a query received timestamp', async () => {
    const { traceService, context, emitAt, events } = handlerFixture();
    delete context.queryReceivedAt;

    await emitAt(1100, {
      response_type: 'bos',
      role: OpenAIMessageRole.ASSISTANT,
    });
    await emitAt(1200, {
      response_type: 'delta',
      message: { content: 'answer' },
    });
    await emitAt(1300, { response_type: 'eos' });
    await emitAt(1400, { response_type: 'done' });

    expect(events()).toHaveLength(0);
    expect(traceService.emitTraceEvents).not.toHaveBeenCalled();
  });

  it('does not report a truncated stream that never receives eos', async () => {
    const { emitAt, events } = handlerFixture();

    await emitAt(1100, {
      response_type: 'bos',
      role: OpenAIMessageRole.ASSISTANT,
    });
    await emitAt(1200, {
      response_type: 'delta',
      message: { content: 'answer' },
    });
    await emitAt(1300, { response_type: 'done' });

    expect(events()).toHaveLength(0);
  });
});
