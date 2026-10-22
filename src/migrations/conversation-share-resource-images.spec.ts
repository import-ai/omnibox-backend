import { ConversationShareResourceImages1792496161554 } from './1792496161554-conversation-share-resource-images';

describe('Conversation share resource images migration', () => {
  it('adds and removes the resource image snapshot column', async () => {
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
    const migration = new ConversationShareResourceImages1792496161554();

    await migration.up(queryRunner as never);
    await migration.down(queryRunner as never);

    expect(operations).toEqual([
      'add:conversation_share_groups.resource_images',
      'drop:conversation_share_groups.resource_images',
    ]);
  });
});
