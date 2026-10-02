import { SearchService } from './search.service';

describe('Message index migration', () => {
  it('previews without clearing, skips uncertain assistants and retries only failed IDs', async () => {
    const service = Object.create(SearchService.prototype);
    service.wizardTaskService = {
      taskRepository: { countBy: jest.fn().mockResolvedValue(0) },
    };
    service.wizardApiService = {
      clearMessageIndex: jest.fn().mockResolvedValue({ deleted: 3 }),
      upsertWeaviateMessage: jest.fn().mockResolvedValue({ success: true }),
    };
    service.conversationsService = {
      listForMessageIndex: jest
        .fn()
        .mockImplementation((_namespaceId, afterId) =>
          afterId ? [] : [{ id: 'c', userId: 'u', namespaceId: 'n' }],
        ),
    };
    service.messagesService = {
      findAll: jest.fn().mockResolvedValue([
        { id: 'q', userId: 'u', message: { role: 'user', content: 'query' } },
        {
          id: 'middle',
          userId: 'u',
          status: 'success',
          message: { role: 'assistant', content: 'intermediate' },
        },
        {
          id: 'final',
          userId: 'u',
          status: 'success',
          attrs: { turn_completed: { query_id: 'q' } },
          message: { role: 'assistant', content: 'answer' },
        },
      ]),
    };
    const preview = await service.rebuildMessageIndex('n', false);
    expect(preview.skipped).toEqual(['middle']);
    expect(preview.synced).toEqual(['q', 'final']);
    expect(service.wizardApiService.clearMessageIndex).not.toHaveBeenCalled();
    await service.rebuildMessageIndex('n', true);
    expect(service.wizardApiService.clearMessageIndex).toHaveBeenCalledTimes(1);
    service.wizardApiService.upsertWeaviateMessage.mockClear();
    await service.rebuildMessageIndex('n', true, ['final']);
    expect(service.wizardApiService.clearMessageIndex).toHaveBeenCalledTimes(1);
    expect(
      service.wizardApiService.upsertWeaviateMessage,
    ).toHaveBeenCalledTimes(1);
    service.wizardTaskService.taskRepository.countBy.mockResolvedValue(1);
    await expect(service.rebuildMessageIndex('n', true)).rejects.toThrow();
  });
});
