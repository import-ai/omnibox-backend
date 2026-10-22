import { SearchService } from './search.service';

describe('History retrieval contract', () => {
  it('keeps semantic tail chunks while UI search retains literal matching', async () => {
    const full = 'Unrelated introduction'.repeat(1000) + 'I dislike coriander';
    const service = Object.create(SearchService.prototype);
    service.permissionsService = {
      userInNamespace: jest.fn().mockResolvedValue(true),
    };
    service.wizardApiService = {
      search: jest.fn().mockResolvedValue({
        records: [
          {
            type: 'message',
            message: {
              messageId: 'm',
              conversationId: 'c',
              chunkIndex: 20,
              startIndex: 22000,
              endIndex: 22019,
              message: { role: 'assistant', content: 'I dislike coriander' },
            },
          },
        ],
      }),
    };
    service.messagesService = {
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({
        conversationId: 'c',
        userId: 'u',
        status: 'success',
        attrs: {},
        message: { role: 'assistant', content: full },
      }),
    };
    service.conversationsService = {
      get: jest
        .fn()
        .mockResolvedValue({ namespaceId: 'n', userId: 'u', title: 'Food' }),
    };
    const hits = await service.searchMessages('u', 'n', '饮食偏好', {
      limit: 10,
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      content: 'I dislike coriander',
      chunkIndex: 20,
      startIndex: 22000,
    });
    expect(await service.searchMessages('u', 'n', '饮食偏好')).toEqual([]);
    expect(
      await service.searchMessages('u', 'n', '饮食偏好', {
        excludeConversationIds: ['c'],
      }),
    ).toEqual([]);
    await service.searchMessages('u', 'n', '饮食偏好', {
      conversationIds: ['c', 'other'],
      excludeConversationIds: ['other'],
      limit: 3,
    });
    expect(service.wizardApiService.search).toHaveBeenLastCalledWith(
      expect.objectContaining({
        conversationIds: ['c'],
        excludeConversationIds: ['other'],
        limit: 9,
      }),
    );
    service.wizardApiService.search.mockClear();
    expect(
      await service.searchMessages('u', 'n', 'q', {
        conversationIds: ['c'],
        excludeConversationIds: ['c'],
      }),
    ).toEqual([]);
    expect(service.wizardApiService.search).not.toHaveBeenCalled();
    service.messagesService.findOne.mockResolvedValue({
      conversationId: 'c',
      userId: 'other',
      message: { role: 'user', content: full },
    });
    expect(await service.searchMessages('u', 'n', '饮食偏好', {})).toEqual([]);
  });
});

describe('History search backfill', () => {
  const hit = (messageId: string, chunkIndex = 0) => ({
    type: 'message',
    message: {
      messageId,
      conversationId: 'c',
      chunkIndex,
      startIndex: 0,
      endIndex: 4,
      message: { role: 'assistant', content: messageId },
    },
  });
  const row = (id: string, values: Record<string, any> = {}) => ({
    id,
    conversationId: 'c',
    userId: 'u',
    parentId: null,
    status: 'success',
    attrs: {},
    message: { role: 'assistant', content: `answer ${id}` },
    ...values,
  });
  const rows: Record<string, any> = {
    tool: row('tool', {
      message: {
        role: 'assistant',
        content: 'calling a tool',
        tool_calls: [{ id: 'call' }],
      },
    }),
    middle: row('middle'),
    after: row('after', { parentId: 'middle' }),
  };
  for (let i = 1; i <= 60; i++) rows[`e${i}`] = row(`e${i}`);

  function setup() {
    const service = Object.create(SearchService.prototype);
    service.permissionsService = {
      userInNamespace: jest.fn().mockResolvedValue(true),
    };
    service.wizardApiService = {
      search: jest.fn(({ limit }: { limit: number }) =>
        Promise.resolve({
          // Ineligible candidates outrank every eligible one.
          records: [
            hit('tool'),
            hit('gone'),
            hit('middle'),
            ...Array.from({ length: 60 }, (_, i) => hit(`e${i + 1}`)),
          ].slice(0, limit),
        }),
      ),
    };
    service.messagesService = {
      findOne: jest.fn((id: string) =>
        rows[id] ? Promise.resolve(rows[id]) : Promise.reject(new Error()),
      ),
      findAll: jest.fn().mockResolvedValue(Object.values(rows)),
    };
    service.conversationsService = {
      get: jest
        .fn()
        .mockResolvedValue({ namespaceId: 'n', userId: 'u', title: 'Chat' }),
    };
    return service;
  }

  it('over-fetches once and fills the limit past ineligible hits', async () => {
    const service = setup();
    const hits = await service.searchMessages('u', 'n', 'q', { limit: 3 });
    expect(hits.map((item: any) => item.messageId)).toEqual(['e1', 'e2', 'e3']);
    expect(service.wizardApiService.search).toHaveBeenCalledTimes(1);
    expect(service.wizardApiService.search).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 0, limit: 9 }),
    );
    expect(service.messagesService.findAll).toHaveBeenCalledTimes(1);
  });

  it('caps the candidate request at the search maximum', async () => {
    const service = setup();
    const hits = await service.searchMessages('u', 'n', 'q', { limit: 50 });
    expect(hits).toHaveLength(50);
    expect(service.wizardApiService.search).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100 }),
    );
  });

  it('defaults to ten hits from thirty candidates', async () => {
    const service = setup();
    expect(await service.searchMessages('u', 'n', 'q', {})).toHaveLength(10);
    expect(service.wizardApiService.search).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 30 }),
    );
  });
});
