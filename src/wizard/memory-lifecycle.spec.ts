import {
  isMessageIndexable,
  Message,
} from '../messages/entities/message.entity';
import { TasksService } from '../tasks/tasks.service';
import { StreamService } from './stream.service';

describe('Memory completion and retry boundaries', () => {
  it.each(['error', 'interrupt'])(
    'does not complete a turn after %s',
    async (kind) => {
      const messages = {
        update: jest
          .fn()
          .mockResolvedValue({ id: 'middle', message: { role: 'assistant' } }),
        updateDelta: jest
          .fn()
          .mockResolvedValue({ message: { role: 'assistant' } }),
        indexFinalAssistant: jest.fn(),
      };
      const hooks = {
        onCallCompleted: jest.fn().mockResolvedValue(undefined),
        onStreamCompleted: jest.fn(),
      };
      const service = new StreamService(
        {} as any,
        {} as any,
        messages as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        hooks as any,
      );
      const handler = service.agentHandler(
        'ns',
        'c',
        'u',
        async () => {},
        false,
        { namespaceId: 'ns', streamId: 's' },
      );
      const context: any = { parentId: 'middle', messageId: 'current' };
      if (kind === 'error') {
        await handler(
          JSON.stringify({ response_type: 'error', message: 'failed' }),
          context,
        );
      } else {
        await handler(
          JSON.stringify({
            response_type: 'delta',
            message: {},
            attrs: { tool_call: { interrupts: [{}] } },
          }),
          context,
        );
        await handler(JSON.stringify({ response_type: 'eos' }), context);
      }
      await handler(JSON.stringify({ response_type: 'done' }), context);
      expect(messages.indexFinalAssistant).not.toHaveBeenCalled();
      expect(hooks.onStreamCompleted).not.toHaveBeenCalled();
    },
  );

  it('checks successful answers and limits retryable task types', () => {
    const message = {
      userId: 'u',
      status: 'success',
      message: { role: 'assistant', content: 'middle' },
    } as Message;
    message.status = 'failed' as any;
    expect(isMessageIndexable(message, [])).toBe(false);
    message.status = 'success' as any;
    expect(isMessageIndexable(message, [])).toBe(true);
    const canRetry = (task: any, error: any) =>
      TasksService.prototype.canRetry.call(config, task, error);
    const config = { maxRetries: 3 } as any;
    expect(
      canRetry({ function: 'update_memory', numSchedules: 3 } as any, {
        retryable: true,
      }),
    ).toBe(true);
    expect(
      canRetry({ function: 'update_memory', numSchedules: 4 } as any, {
        retryable: true,
      }),
    ).toBe(false);
    expect(
      canRetry({ function: 'other', numSchedules: 1 } as any, {
        retryable: true,
      }),
    ).toBe(false);
  });
});
