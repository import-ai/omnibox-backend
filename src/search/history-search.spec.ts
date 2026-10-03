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
      findOne: jest.fn().mockResolvedValue({
        conversationId: 'c',
        userId: 'u',
        status: 'success',
        attrs: { turn_completed: { query_id: 'q' } },
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
        excludeConversationId: 'c',
      }),
    ).toEqual([]);
    service.messagesService.findOne.mockResolvedValue({
      conversationId: 'c',
      userId: 'other',
      message: { role: 'user', content: full },
    });
    expect(await service.searchMessages('u', 'n', '饮食偏好', {})).toEqual([]);
  });
});
