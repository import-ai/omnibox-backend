import { ConversationHistoryService } from './conversation-history.service';

describe('ConversationHistoryService summary rows', () => {
  it('keeps the interrupts of a message nobody has answered yet', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new ConversationHistoryService(
      { query } as any,
      {} as any,
      { t: (key: string) => key } as any,
    );

    await (service as any).rows('conversation-id', 'user-id', ['id'], false);

    const sql: string = query.mock.calls[0][0];
    // A pending approval is the branch leaf: its interrupts must survive the
    // summary so the web can show the decision buttons after a reload. A
    // message that already has a reply only needs them in the details.
    expect(sql).toMatch(
      /CASE WHEN EXISTS \(SELECT 1 FROM messages child WHERE child\.parent_id = messages\.id AND child\.deleted_at IS NULL\)\s+THEN 'interrupts' ELSE '__unused__' END/,
    );
    expect(sql).not.toMatch(/\(attrs->'tool_call'\) - 'interrupts'/);
  });
});
