import { ConversationShareImages1792487655534 } from './1792487655534-conversation-share-images';

describe('Conversation share images migration', () => {
  it('adds and removes the question image snapshot column', async () => {
    const operations: string[] = [];
    const queryRunner = {
      addColumn: jest.fn((table: string, column: { name: string }) => {
        operations.push(`add:${table}.${column.name}`);
        return Promise.resolve();
      }),
      dropColumn: jest.fn((table: string, column: string) => {
        operations.push(`drop:${table}.${column}`);
        return Promise.resolve();
      }),
    };
    const migration = new ConversationShareImages1792487655534();

    await migration.up(queryRunner as never);
    await migration.down(queryRunner as never);

    expect(operations).toEqual([
      'add:conversation_share_groups.question_images',
      'drop:conversation_share_groups.question_images',
    ]);
  });
});
