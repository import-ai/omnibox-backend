import { Message } from './entities/message.entity';
import { MessagesService } from './messages.service';

describe('Turn completion dispatch', () => {
  it('locks the final message and uses existing tasks to avoid duplicate indexing', async () => {
    const final = {
      id: 'a',
      conversationId: 'c',
      userId: 'u',
      status: 'success',
      message: { role: 'assistant', content: 'answer' },
      attrs: {},
    };
    let enqueued = false;
    const builder: any = {
      withDeleted: () => builder,
      where: () => builder,
      andWhere: () => builder,
      getExists: () => Promise.resolve(enqueued),
    };
    const repo = {
      findOneOrFail: jest.fn().mockResolvedValue(final),
      findBy: jest.fn().mockResolvedValue([]),
    };
    const manager = {
      getRepository: (entity: any) =>
        entity === Message ? repo : { createQueryBuilder: () => builder },
    };
    const service = Object.create(MessagesService.prototype);
    service.dataSource = { manager: { transaction: (cb: any) => cb(manager) } };
    service.wizardTaskService = {
      emitUpsertMessageIndexTask: jest.fn(() => {
        enqueued = true;
        return Promise.resolve();
      }),
    };
    const hook = jest.fn();
    await service.indexFinalAssistant('a', 'n', 'c', hook);
    await service.indexFinalAssistant('a', 'n', 'c', hook);
    expect(
      service.wizardTaskService.emitUpsertMessageIndexTask,
    ).toHaveBeenCalledTimes(1);
    // Each hook owns its independent task deduplication.
    expect(hook).toHaveBeenCalledTimes(2);
    expect(final.attrs).toEqual({});
    expect(repo.findOneOrFail).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
  });
});
