import { Conversation } from 'omniboxd/conversations/entities/conversation.entity';

import { MessageStatus, OpenAIMessageRole } from './entities/message.entity';
import { MessagesService } from './messages.service';

function setup(existing?: any) {
  const saved: any[] = [];
  const queryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(existing),
  };
  const manager: any = {
    getRepository: jest.fn((entity) =>
      entity === Conversation
        ? { findOneOrFail: jest.fn().mockResolvedValue({}) }
        : { createQueryBuilder: () => queryBuilder },
    ),
    save: jest.fn((value) => {
      const result = {
        ...value,
        id: 'saved',
        createdAt: new Date('2026-09-12T02:30:00Z'),
      };
      saved.push(result);
      return Promise.resolve(result);
    }),
  };
  manager.transaction = (fn: any) => fn(manager);
  const service = new MessagesService(
    { create: (dto: any) => dto } as any,
    { existsBy: jest.fn().mockResolvedValue(true) } as any,
    { manager } as any,
    { emitUpsertMessageIndexTask: jest.fn() } as any,
    { getMe: jest.fn() } as any,
    { t: (key: string) => key } as any,
  );
  return { service, saved };
}

const dto = {
  message: { role: OpenAIMessageRole.USER, content: 'hello' },
  status: MessageStatus.SUCCESS,
};

test('persists SUCCESS with authoritative offset time, without adding time to permission decisions', async () => {
  const { service } = setup();
  const message = await service.create('ns', 'conv', 'user', dto, false, {
    timeZone: 'Asia/Shanghai',
    clientRequestId: 'request',
  });
  expect(message.status).toBe('success');
  expect(message.attrs).toMatchObject({
    client_request_id: 'request',
    user_context: { created_at: '2026-09-12T10:30:00.000+08:00' },
  });
  const decision = await service.create(
    'ns',
    'conv',
    'user',
    { ...dto, attrs: { tool_call: { decisions: [{ type: 'approve' }] } } },
    false,
    {},
  );
  expect(decision.attrs?.user_context?.created_at).toBeUndefined();
});

test('reuses an acknowledged request even when JSONB reorders keys, and rejects changed content', async () => {
  const existing = {
    id: 'original',
    userId: 'user',
    parentId: null,
    message: { content: 'hello', role: OpenAIMessageRole.USER },
    attrs: { client_request_id: 'request' },
  };
  const { service, saved } = setup(existing);
  expect(
    await service.create('ns', 'conv', 'user', dto, false, {
      clientRequestId: 'request',
    }),
  ).toBe(existing);
  expect(saved).toHaveLength(0);
  await expect(
    service.create(
      'ns',
      'conv',
      'user',
      { ...dto, message: { ...dto.message, content: 'changed' } },
      false,
      { clientRequestId: 'request' },
    ),
  ).rejects.toThrow();
});
