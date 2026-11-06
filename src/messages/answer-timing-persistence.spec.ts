import { beginAnswerTiming } from './answer-timing';
import {
  Message,
  MessageStatus,
  OpenAIMessageRole,
} from './entities/message.entity';
import { MessagesService } from './messages.service';

function fixture(status = MessageStatus.SUCCESS) {
  const rows = new Map<string, Message>();
  rows.set('answer', {
    id: 'answer',
    conversationId: 'conversation',
    message: { role: OpenAIMessageRole.ASSISTANT },
    status,
    attrs: { answer_timing: beginAnswerTiming('run', [], 1000) },
  } as Message);
  const repo = {
    findOneByOrFail: ({ id }: { id: string }) =>
      Promise.resolve(structuredClone(rows.get(id))),
    findOneOrFail: ({ where }: { where: { id: string } }) =>
      Promise.resolve(structuredClone(rows.get(where.id))),
    save: (message: Message) => {
      rows.set(message.id, structuredClone(message));
      return Promise.resolve(message);
    },
  };
  const manager: any = { getRepository: () => repo, save: repo.save };
  manager.transaction = (fn: any) => fn(manager);
  const service = new MessagesService(
    repo as any,
    {} as any,
    { manager, transaction: manager.transaction } as any,
    {} as any,
    {} as any,
    {} as any,
  );
  return { service: service as any, rows };
}

test('persists the final server snapshot once and ignores a different run', async () => {
  const { service, rows } = fixture();
  await service.finalizeAnswerTiming('answer', 'different', 'success', 4000);
  expect(rows.get('answer')?.attrs?.answer_timing?.outcome).toBe('running');
  await service.finalizeAnswerTiming('answer', 'run', 'success', 4000);
  await service.finalizeAnswerTiming('answer', 'run', 'success', 9000);
  expect(rows.get('answer')?.attrs?.answer_timing).toMatchObject({
    outcome: 'success',
    duration_ms: 3000,
  });
});

test('a persisted stop wins over a late successful completion', async () => {
  const { service, rows } = fixture(MessageStatus.STOPPED);
  await service.finalizeAnswerTiming('answer', 'run', 'success', 4000);
  expect(rows.get('answer')?.status).toBe(MessageStatus.STOPPED);
  expect(rows.get('answer')?.attrs?.answer_timing?.outcome).toBe('stopped');
});
