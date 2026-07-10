import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import { StreamService } from 'omniboxd/wizard/stream.service';

function createService(mocks: {
  namespaceResourcesService?: Record<string, jest.Mock>;
  sharedResourcesService?: Record<string, jest.Mock>;
  resourcesService?: Record<string, jest.Mock>;
  smartFoldersService?: Record<string, jest.Mock>;
}) {
  return new StreamService(
    { get: jest.fn() } as any,
    {} as any,
    {} as any,
    mocks.namespaceResourcesService as any,
    mocks.sharedResourcesService as any,
    mocks.resourcesService as any,
    mocks.smartFoldersService as any,
    {} as any,
  );
}

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
