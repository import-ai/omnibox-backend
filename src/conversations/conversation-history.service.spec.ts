import { ConversationHistoryService } from './conversation-history.service';

const interrupt = { name: 'create_resource', args: {}, decisions: ['approve'] };

function node(
  id: string,
  parent_id: string | null,
  role: string,
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    parent_id,
    status: 'success',
    role,
    has_content: role !== 'tool',
    has_tool_calls: false,
    is_decision: false,
    ...extra,
  };
}

function row(id: string, parent_id: string | null, role: string) {
  return {
    id,
    parent_id,
    created_at: new Date('2026-10-19T00:00:00Z'),
    updated_at: new Date('2026-10-19T00:00:00Z'),
    status: 'success',
    message: { role, content: '' },
    // The summary SQL removes interrupts from attrs and selects them apart.
    attrs: { tool_call: {} },
    has_reasoning: false,
    tool_call_summaries: [],
    interrupts: role === 'assistant' ? [interrupt] : null,
  };
}

describe('ConversationHistoryService.page', () => {
  it('keeps interrupts only on a message nobody has answered yet', async () => {
    // q1 -> answered (interrupt, decided) -> decision -> tool -> q2 -> pending
    const nodes = [
      node('q1', null, 'user'),
      node('answered', 'q1', 'assistant', { has_tool_calls: true }),
      node('decision', 'answered', 'user', {
        is_decision: true,
        has_content: false,
      }),
      node('tool', 'decision', 'tool'),
      node('q2', 'tool', 'user'),
      node('pending', 'q2', 'assistant', { has_tool_calls: true }),
    ];
    const query = jest.fn((sql: string, params: unknown[]) => {
      if (sql.includes('is_decision')) return Promise.resolve(nodes);
      if (sql.includes('tool_call_summaries')) {
        const ids = params[2] as string[];
        return Promise.resolve(
          nodes
            .filter((n) => ids.includes(n.id))
            .map((n) => row(n.id, n.parent_id, n.role)),
        );
      }
      return Promise.resolve([]);
    });
    const service = new ConversationHistoryService(
      { query } as any,
      {
        findOneForUserInNamespace: jest.fn().mockResolvedValue({
          id: 'conversation-id',
          title: '',
          createdAt: new Date('2026-10-19T00:00:00Z'),
          updatedAt: new Date('2026-10-19T00:00:00Z'),
        }),
      } as any,
      { t: (key: string) => key } as any,
    );

    const page = await service.page('ns', 'conversation-id', 'user-id', {
      offset: 0,
      limit: 10,
    } as any);

    expect(page.current_node).toBe('pending');
    expect(page.mapping.pending.attrs).toEqual({
      tool_call: { interrupts: [interrupt] },
    });
    expect(page.mapping.answered.attrs).toEqual({ tool_call: {} });
    expect(page.mapping.pending).not.toHaveProperty('interrupts');
  });
});
