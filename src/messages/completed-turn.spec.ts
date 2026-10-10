import { MessagesService } from './messages.service';

it('resolves the original query across approval, ignores earlier turns, and rejects broken ancestry', async () => {
  const row = (
    id: string,
    role: string,
    parentId: string | null,
    attrs = {},
  ) => ({
    id,
    conversationId: 'c',
    userId: 'u',
    parentId,
    attrs,
    createdAt: new Date(),
    message: { role, content: id },
  });
  const query = row('q', 'user', 'old');
  const attempt = row('attempt', 'assistant', 'q', {
    context: { memory_write_attempt: true },
  });
  const approval = row('approval', 'user', 'attempt', {
    tool_call: { decisions: ['reject'] },
  });
  const final = row('a', 'assistant', 'approval');
  const rows = [query, attempt, approval, final];
  const service = Object.create(MessagesService.prototype);
  service.isIndexable = jest.fn().mockResolvedValue(true);
  service.messageRepository = {
    findOneBy: jest.fn(({ id }) =>
      Promise.resolve(rows.find((row) => row.id === id) ?? null),
    ),
  };
  expect(await service.completedTurn(final)).toMatchObject({
    query: { id: 'q' },
    assistant: { id: 'a' },
    memory_write_attempt: true,
  });
  final.parentId = 'q';
  expect(await service.completedTurn(final)).toMatchObject({
    memory_write_attempt: false,
  });
  final.parentId = 'missing';
  expect(await service.completedTurn(final)).toBeNull();
  final.parentId = 'a';
  expect(await service.completedTurn(final)).toBeNull();
  service.isIndexable.mockResolvedValue(false);
  expect(await service.completedTurn(final)).toBeNull();
});
