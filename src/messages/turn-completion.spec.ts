import { MessagesService } from './messages.service';

describe('Durable turn completion', () => {
  it('atomically marks and enqueues once with the original query', async () => {
    const query = { id: 'q', conversationId: 'c', message: { role: 'user' } };
    const final = {
      id: 'a',
      conversationId: 'c',
      userId: 'u',
      parentId: 'q',
      status: 'success',
      message: { role: 'assistant', content: 'answer' },
      attrs: {},
    };
    const repo = {
      findOneOrFail: jest.fn().mockResolvedValue(final),
      findOneBy: jest.fn().mockResolvedValue(query),
      save: jest.fn().mockResolvedValue(final),
    };
    const manager = { getRepository: jest.fn().mockReturnValue(repo) };
    const service = Object.create(MessagesService.prototype);
    service.dataSource = {
      manager: { transaction: (cb: any) => cb(manager) },
    };
    service.wizardTaskService = { emitUpsertMessageIndexTask: jest.fn() };
    const hook = jest.fn().mockImplementation((tx) => {
      expect(tx.entityManager).toBe(manager);
      expect(final.attrs).toMatchObject({ turn_completed: { query_id: 'q' } });
    });
    await service.indexFinalAssistant('a', 'n', 'c', hook);
    await service.indexFinalAssistant('a', 'n', 'c', hook);
    expect(hook).toHaveBeenCalledTimes(1);
    expect(
      service.wizardTaskService.emitUpsertMessageIndexTask,
    ).toHaveBeenCalledTimes(1);
    expect(repo.findOneOrFail).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
  });
});
