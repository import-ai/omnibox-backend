import { MessageIndexMigrationService } from './message-index-migration.service';

describe('Message index migration', () => {
  it('previews without clearing, skips intermediate assistants and retries only failed IDs', async () => {
    const service = Object.create(MessageIndexMigrationService.prototype);
    service.taskRepository = { countBy: jest.fn().mockResolvedValue(0) };
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
          parentId: 'middle',
          userId: 'u',
          status: 'success',
          attrs: {},
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
    service.taskRepository.countBy.mockResolvedValue(1);
    await expect(service.rebuildMessageIndex('n', true)).rejects.toThrow();
  });

  it('runs the same migration once per selected namespace', async () => {
    const service = Object.create(MessageIndexMigrationService.prototype);
    service.namespaceRepository = {
      find: jest.fn().mockResolvedValue([{ id: 'a' }, { id: 'b' }]),
    };
    service.taskRepository = { countBy: jest.fn().mockResolvedValue(0) };
    service.rebuildMessageIndex = jest
      .fn()
      .mockImplementation((namespaceId: string) => ({
        namespace_id: namespaceId,
        scanned: 0,
        deleted: 0,
        synced: [],
        skipped: [],
        failed: [],
      }));

    const report = await service.rebuildAllMessageIndexes(true);

    expect(report.namespace_count).toBe(2);
    expect(service.rebuildMessageIndex).toHaveBeenNthCalledWith(1, 'a', true);
    expect(service.rebuildMessageIndex).toHaveBeenNthCalledWith(2, 'b', true);
  });

  it('rejects unknown namespace filters before applying any migration', async () => {
    const service = Object.create(MessageIndexMigrationService.prototype);
    service.namespaceRepository = {
      find: jest.fn().mockResolvedValue([{ id: 'a' }]),
    };
    service.rebuildMessageIndex = jest.fn();

    await expect(
      service.rebuildAllMessageIndexes(false, ['a', 'missing']),
    ).rejects.toMatchObject({ code: 'NAMESPACE_NOT_FOUND' });
    expect(service.rebuildMessageIndex).not.toHaveBeenCalled();
  });
});
