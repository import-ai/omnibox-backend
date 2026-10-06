import {
  childrenByMessage,
  isMessageIndexable,
  Message,
} from './entities/message.entity';

const row = (id: string, role = 'assistant', parentId?: string): Message =>
  ({
    id,
    conversationId: 'c',
    userId: 'u',
    parentId,
    status: 'success',
    message: { role, content: 'Glass city' },
    attrs: {},
  }) as Message;

it('indexes historical answers at each branch boundary without a new marker', () => {
  const a = row('a');
  expect(isMessageIndexable(a, [])).toBe(true);
  expect(isMessageIndexable(a, [row('q', 'user', 'a')])).toBe(true);
  expect(isMessageIndexable(a, [row('next', 'assistant', 'a')])).toBe(false);
  expect(isMessageIndexable(a, [row('tool', 'tool', 'a')])).toBe(false);
  const approval = row('approval', 'user', 'a');
  approval.attrs = { tool_call: { decisions: ['reject'] } };
  expect(isMessageIndexable(a, [approval])).toBe(false);
  expect(isMessageIndexable(a, [approval, row('branch', 'user', 'a')])).toBe(
    true,
  );
  const deleted = row('deleted', 'assistant', 'a');
  deleted.deletedAt = new Date();
  const foreign = row('foreign', 'assistant', 'a');
  foreign.conversationId = 'other';
  expect(isMessageIndexable(a, [deleted, foreign])).toBe(true);
  const children = childrenByMessage([a, deleted, row('q', 'user', 'a')]);
  expect(children.get('a')?.map((m) => m.id)).toEqual(['q']);
});

it.each(['pending', 'streaming', 'stopped', 'interrupted', 'failed'])(
  'excludes %s answers',
  (status) => {
    expect(isMessageIndexable({ ...row('a'), status } as Message, [])).toBe(
      false,
    );
  },
);

it('excludes incomplete, empty and unowned answers', () => {
  const a = row('a');
  a.message.tool_calls = [{ id: 'call' }];
  expect(isMessageIndexable(a, [])).toBe(false);
  delete a.message.tool_calls;
  a.attrs = { tool_call: { interrupts: [{}] } };
  expect(isMessageIndexable(a, [])).toBe(false);
  a.attrs = {};
  a.message.content = ' ';
  expect(isMessageIndexable(a, [])).toBe(false);
  a.message.content = 'answer';
  a.userId = null;
  expect(isMessageIndexable(a, [])).toBe(false);
});
