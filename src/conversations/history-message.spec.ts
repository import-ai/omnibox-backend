import { InternalConversationsController } from './internal.conversations.controller';

describe('History message reads', () => {
  it('returns 404 for deleted messages, matching the index consumer contract', async () => {
    const conversations = {
      findOneForUserInNamespace: jest.fn().mockResolvedValue({}),
    };
    const messages = { findNullable: jest.fn().mockResolvedValue(null) };
    const controller = new InternalConversationsController(
      conversations as any,
      messages as any,
    );
    await expect(
      controller.readMessage(
        'n',
        'c',
        'deleted',
        'u',
        undefined,
        undefined,
        'true',
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
});
