import { ConversationAttachment } from 'omniboxd/attachments/entities/conversation-attachment.entity';
import { MessageAttachment } from 'omniboxd/attachments/entities/message-attachment.entity';

import { MessagesService } from './messages.service';

describe('MessagesService conversation attachments', () => {
  it('binds an already consumed image to an edited message without changing its consumption time', async () => {
    const consumedAt = new Date(0);
    const attachment = { id: 'att', consumedAt };
    const attachments = { find: jest.fn().mockResolvedValue([attachment]) };
    const links = { create: jest.fn((value) => value) };
    const manager = {
      save: jest.fn((value) => Promise.resolve(value)),
      getRepository: jest.fn((entity) =>
        entity === ConversationAttachment ? attachments : links,
      ),
    };
    const messageRepository = {
      create: jest.fn((value) => ({ ...value, id: 'new-message' })),
    };
    const conversationRepository = {
      existsBy: jest.fn().mockResolvedValue(true),
    };
    const service = new MessagesService(
      messageRepository as any,
      conversationRepository as any,
      { manager: { transaction: (callback) => callback(manager) } } as any,
      {} as any,
      { getMe: jest.fn() } as any,
      { t: (key: string) => key } as any,
    );
    await service.create(
      'ns',
      'conv',
      'user',
      {
        message: { role: 'user', content: 'Edited query' },
        attrs: {
          composer: {
            display_parts: [{ type: 'image', attachment_id: 'att' }],
          },
        },
      } as any,
      false,
    );
    const query = attachments.find.mock.calls[0][0];
    expect(query.lock).toEqual({ mode: 'pessimistic_write' });
    expect(query.where).toHaveLength(2);
    for (const where of query.where) {
      expect(where).toMatchObject({
        namespaceId: 'ns',
        conversationId: 'conv',
        userId: 'user',
      });
    }
    expect(query.where[0].consumedAt.type).toBe('not');
    expect(query.where[1].expiresAt.type).toBe('moreThan');
    expect(manager.getRepository).toHaveBeenCalledWith(MessageAttachment);
    expect(links.create).toHaveBeenCalledWith({
      messageId: 'new-message',
      attachmentId: 'att',
      position: 0,
    });
    expect(attachment.consumedAt).toBe(consumedAt);
  });
});
