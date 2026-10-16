import { HttpStatus } from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';

import { ConversationsService } from './conversations.service';
import { InternalConversationsController } from './internal.conversations.controller';

describe('History message reads', () => {
  it('returns 404 for deleted messages, matching the index consumer contract', async () => {
    const conversations = {
      findLiveForUserInNamespace: jest.fn().mockResolvedValue({}),
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

it('reads authorized intermediate text without exposing internal attributes', async () => {
  const controller = new InternalConversationsController(
    { findLiveForUserInNamespace: jest.fn().mockResolvedValue({}) } as any,
    {
      findNullable: jest.fn().mockResolvedValue({
        conversationId: 'c',
        userId: 'u',
        message: {
          role: 'assistant',
          content: '🙂old text',
          reasoning_content: 'hidden',
        },
        attrs: { context: { checkpoint: 'secret' } },
      }),
    } as any,
  );
  const result = await controller.readMessage('n', 'c', 'm', 'u', '1', '3');
  expect(result).toMatchObject({ content: 'old', next_offset: 4 });
  expect(JSON.stringify(result)).not.toMatch(/hidden|checkpoint|secret/);
});

it('does not expose system messages through history reads', async () => {
  const controller = new InternalConversationsController(
    { findLiveForUserInNamespace: jest.fn().mockResolvedValue({}) } as any,
    {
      findNullable: jest.fn().mockResolvedValue({
        conversationId: 'c',
        userId: 'u',
        message: { role: 'system', content: 'private prompt' },
      }),
    } as any,
  );
  await expect(
    controller.readMessage('n', 'c', 'm', 'u'),
  ).rejects.toMatchObject({ status: 404 });
});

it('pages long answers using character offsets without returning the full answer', async () => {
  const content = '🙂'.repeat(9000);
  const controller = new InternalConversationsController(
    { findLiveForUserInNamespace: jest.fn().mockResolvedValue({}) } as any,
    {
      findNullable: jest.fn().mockResolvedValue({
        conversationId: 'c',
        userId: 'u',
        message: { role: 'assistant', content },
      }),
    } as any,
  );
  const first = await controller.readMessage('n', 'c', 'm', 'u');
  const second = await controller.readMessage('n', 'c', 'm', 'u', '4000');
  const last = await controller.readMessage('n', 'c', 'm', 'u', '8000');
  expect(first).toMatchObject({
    content: '🙂'.repeat(4000),
    next_offset: 4000,
    total: 9000,
  });
  expect(second).toMatchObject({
    content: '🙂'.repeat(4000),
    next_offset: 8000,
  });
  expect(last).toMatchObject({ content: '🙂'.repeat(1000), next_offset: null });
});

describe('Worker reads of a deleted conversation', () => {
  function controllerFor(namespaces: { getMe: jest.Mock }) {
    const conversations = new ConversationsService(
      { findOne: jest.fn().mockResolvedValue(null) } as any,
      {} as any,
      {} as any,
      namespaces as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { t: (key: string) => key } as any,
    );
    const messages = {
      findNullable: jest.fn(),
      completedTurn: jest.fn(),
    };
    return {
      controller: new InternalConversationsController(
        conversations,
        messages as any,
      ),
      messages,
    };
  }

  const reads: [
    string,
    (c: InternalConversationsController) => Promise<any>,
  ][] = [
    [
      'index read',
      (c) => c.readMessage('n', 'c', 'm', 'u', undefined, undefined, 'true'),
    ],
    ['ranged read', (c) => c.readMessage('n', 'c', 'm', 'u', '0', '4000')],
    ['completed turn', (c) => c.completedTurn('n', 'c', 'm', 'u')],
  ];

  it.each(reads)(
    'answers 404 for the %s so the task treats the source as gone',
    async (_, read) => {
      const { controller, messages } = controllerFor({
        getMe: jest.fn().mockResolvedValue({}),
      });
      await expect(read(controller)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        code: 'CONVERSATION_NOT_FOUND',
      });
      expect(messages.findNullable).not.toHaveBeenCalled();
    },
  );

  it.each(reads)(
    'keeps 403 for the %s when the user left the namespace',
    async (_, read) => {
      const { controller } = controllerFor({
        getMe: jest
          .fn()
          .mockRejectedValue(
            new AppException('no', 'NOT_A_MEMBER', HttpStatus.FORBIDDEN),
          ),
      });
      await expect(read(controller)).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
      });
    },
  );
});
