import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import { StreamService } from 'omniboxd/wizard/stream.service';

function createService(mocks: {
  conversationsService?: Record<string, jest.Mock>;
  namespaceResourcesService?: Record<string, jest.Mock>;
  sharedResourcesService?: Record<string, jest.Mock>;
  resourcesService?: Record<string, jest.Mock>;
  smartFoldersService?: Record<string, jest.Mock>;
}) {
  return new StreamService(
    { get: jest.fn() } as any,
    {} as any,
    {} as any,
    mocks.conversationsService as any,
    mocks.namespaceResourcesService as any,
    mocks.sharedResourcesService as any,
    mocks.resourcesService as any,
    mocks.smartFoldersService as any,
    {} as any,
    {
      record: jest.fn().mockResolvedValue(undefined),
      settle: jest.fn().mockResolvedValue(undefined),
    } as any,
  );
}

describe('StreamService conversation ownership', () => {
  const accessDenied = new Error('conversation access denied');

  it.each(['ask', 'write'] as const)(
    'rejects %s before creating a user agent stream',
    async (action) => {
      const conversationsService = {
        findOneForUserInNamespace: jest.fn().mockRejectedValue(accessDenied),
      };
      const service = createService({ conversationsService });
      const createAgentStream = jest.spyOn(service as any, 'createAgentStream');

      await expect(
        service.createUserAgentStream(
          'user-id',
          'namespace-id',
          {
            conversation_id: 'conversation-id',
          } as any,
          'request-id',
          action,
        ),
      ).rejects.toBe(accessDenied);

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
  it('treats smart folders as folders when all visible resources are exposed', async () => {
    const namespaceResourcesService = {
      getAllResourcesByUser: jest.fn().mockResolvedValue([
        {
          id: 'smart-folder-id',
          name: 'Smart folder',
          resourceType: ResourceType.SMART_FOLDER,
        },
      ]),
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
      set: jest.fn(),
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

    expect(client.del).toHaveBeenCalledWith([
      'wizard:stream:stream-key:events',
      'wizard:stream:stream-key:seq',
    ]);
    expect(client.del).toHaveBeenCalledWith('wizard:stream:stream-key:cancel');
    expect(client.set).toHaveBeenCalledWith(
      'wizard:stream:stream-key:active',
      '1',
      { EX: 3600 },
    );
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
    );
  });
});

describe('StreamService agent-credit metering', () => {
  const streamKey = 'user:user-id:namespace-id:conversation-id';

  const createMeteredService = () => {
    const settler = { record: jest.fn(), settle: jest.fn() };
    settler.record.mockResolvedValue(undefined);
    settler.settle.mockResolvedValue(undefined);
    const service = new StreamService(
      { get: jest.fn() } as any,
      {} as any,
      {
        updateDelta: jest.fn().mockResolvedValue({ message: {} }),
        update: jest.fn().mockResolvedValue({ id: 'message-id', message: {} }),
      } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      settler as any,
    );
    return { service, settler };
  };

  const usageDelta = (usage: Record<string, any>) =>
    JSON.stringify({
      response_type: 'delta',
      message: {},
      attrs: { usage },
    });

  it('flushes accumulated LLM-call tokens to the settler on eos', async () => {
    const { service, settler } = createMeteredService();
    const handler = service.agentHandler(
      'namespace-id',
      'conversation-id',
      'user-id',
      jest.fn().mockResolvedValue(undefined),
      false,
      streamKey,
    );
    const context = { messageId: 'message-id' } as any;

    await handler(
      usageDelta({
        prompt_tokens: 12194,
        completion_tokens: 15,
        total_tokens: 12209,
        prompt_tokens_details: { cached_tokens: 12032 },
        context_compact: { estimated_tokens: 83, trigger_tokens: 100000 },
      }),
      context,
    );
    expect(settler.record).not.toHaveBeenCalled();

    await handler(
      JSON.stringify({ response_type: 'eos', role: 'assistant' }),
      context,
    );

    expect(settler.record).toHaveBeenCalledWith('namespace-id', streamKey, {
      inputTokenCached: 12032,
      inputTokenUncached: 162,
      outputToken: 15,
    });
  });

  it('flushes each LLM call once, on its own eos', async () => {
    const { service, settler } = createMeteredService();
    const handler = service.agentHandler(
      'namespace-id',
      'conversation-id',
      'user-id',
      jest.fn().mockResolvedValue(undefined),
      false,
      streamKey,
    );
    const context = { messageId: 'message-id' } as any;

    await handler(
      usageDelta({ prompt_tokens: 100, completion_tokens: 5 }),
      context,
    );
    await handler(
      JSON.stringify({ response_type: 'eos', role: 'assistant' }),
      context,
    );
    context.messageId = 'message-id-2';
    await handler(
      JSON.stringify({ response_type: 'eos', role: 'assistant' }),
      context,
    );

    expect(settler.record).toHaveBeenCalledTimes(1);
    expect(settler.record).toHaveBeenCalledWith('namespace-id', streamKey, {
      inputTokenCached: 0,
      inputTokenUncached: 100,
      outputToken: 5,
    });
  });

  it('does not record without a stream key', async () => {
    const { service, settler } = createMeteredService();
    const handler = service.agentHandler(
      'namespace-id',
      'conversation-id',
      'user-id',
      jest.fn().mockResolvedValue(undefined),
    );
    const context = { messageId: 'message-id' } as any;

    await handler(
      usageDelta({ prompt_tokens: 100, completion_tokens: 5 }),
      context,
    );
    await handler(
      JSON.stringify({ response_type: 'eos', role: 'assistant' }),
      context,
    );

    expect(settler.record).not.toHaveBeenCalled();
  });
});
