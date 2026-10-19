import { MessagesService } from './messages.service';

function serviceWith(messages: { id: string; parentId: string | null }[]) {
  const createdAt = new Date('2026-10-16T08:00:00Z');
  const repository = {
    find: jest
      .fn()
      .mockResolvedValue(
        messages.map((message) => ({ ...message, createdAt })),
      ),
    findOne: jest.fn(({ where }) => Promise.resolve({ id: where.id })),
  };
  const service = new MessagesService(
    repository as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    { t: (key: string) => key } as any,
  );
  return { service, repository };
}

describe('MessagesService.findLatest', () => {
  it('returns the reply of a pair saved with one timestamp', async () => {
    const { service } = serviceWith([
      { id: 'ffff-user', parentId: 'previous' },
      { id: '0000-assistant', parentId: 'ffff-user' },
      { id: 'previous', parentId: null },
    ]);

    await expect(
      service.findLatest('user-id', 'conversation-id'),
    ).resolves.toEqual({ id: '0000-assistant' });
  });

  it('follows the second save after a save', async () => {
    const { service, repository } = serviceWith([
      { id: 'a-user-1', parentId: null },
      { id: 'f-assistant-1', parentId: 'a-user-1' },
      { id: 'e-user-2', parentId: 'f-assistant-1' },
      { id: 'b-assistant-2', parentId: 'e-user-2' },
    ]);

    await expect(
      service.findLatest('user-id', 'conversation-id'),
    ).resolves.toEqual({ id: 'b-assistant-2' });
    expect(repository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { conversationId: 'conversation-id', userId: 'user-id' },
      }),
    );
  });

  it('returns null for an empty conversation', async () => {
    const { service, repository } = serviceWith([]);

    await expect(
      service.findLatest('user-id', 'conversation-id'),
    ).resolves.toBeNull();
    expect(repository.findOne).not.toHaveBeenCalled();
  });

  it('finds the newest message below a node by following the newest child', async () => {
    const { service } = serviceWith([
      { id: 'a1', parentId: null },
      { id: 'q-old', parentId: 'a1' },
      { id: 'a-old', parentId: 'q-old' },
      { id: 'q-new', parentId: 'a1' },
      { id: 'a-new', parentId: 'q-new' },
    ]);

    await expect(
      service.findLeafBelow('a1', 'conversation-id', 'user-id'),
    ).resolves.toEqual({ id: 'a-new' });
  });
});
