import { ConversationShares1781600000000 } from './1781600000000-conversation-shares';

describe('ConversationShares migration', () => {
  it('drops dependent tables before the enum types', async () => {
    const operations: string[] = [];
    const queryRunner = {
      dropTable: jest.fn((table: string) => {
        operations.push(`table:${table}`);
        return Promise.resolve();
      }),
      query: jest.fn((sql: string) => {
        operations.push(`query:${sql}`);
        return Promise.resolve();
      }),
    };

    await new ConversationShares1781600000000().down(queryRunner as never);

    expect(operations).toEqual([
      'table:conversation_share_events',
      'table:conversation_share_groups',
      'table:conversation_shares',
      'query:DROP TYPE IF EXISTS conversation_share_channel',
      'query:DROP TYPE IF EXISTS conversation_share_status',
    ]);
  });
});
