import { ChatDeltaResponse } from 'omniboxd/wizard/dto/chat-response.dto';
import { Repository } from 'typeorm';

import {
  Message,
  MessageStatus,
  OpenAIMessageRole,
} from './entities/message.entity';
import { MessagesService } from './messages.service';

jest.mock('omniboxd/tasks/wizard-task.service', () => ({
  WizardTaskService: jest.fn(),
}));

describe('MessagesService', () => {
  describe('updateDelta', () => {
    it('merges raw usage attrs into the message attrs', async () => {
      const rawUsage = {
        prompt_tokens: 795,
        completion_tokens: 10,
        total_tokens: 805,
        completion_tokens_details: { text_tokens: 10 },
        prompt_tokens_details: { text_tokens: 795 },
        context_compact: {
          estimated_tokens: 123,
          trigger_tokens: 100000,
        },
      };
      const message = {
        id: 'message-1',
        message: {
          role: OpenAIMessageRole.ASSISTANT,
          content: 'hello',
        },
        attrs: {
          user_context: { language: 'zh-CN' },
        },
        status: MessageStatus.PENDING,
      } as unknown as Message;
      const messageRepository = {
        findOneOrFail: jest.fn().mockResolvedValue(message),
        save: jest
          .fn()
          .mockImplementation((entity: Message) => Promise.resolve(entity)),
      } as unknown as jest.Mocked<
        Pick<Repository<Message>, 'findOneOrFail' | 'save'>
      >;
      const service = new MessagesService(
        messageRepository as unknown as Repository<Message>,
        {} as any,
        {} as any,
      );

      const result = await service.updateDelta('message-1', {
        response_type: 'delta',
        message: {},
        attrs: { usage: rawUsage },
      } as ChatDeltaResponse);

      expect(messageRepository.findOneOrFail).toHaveBeenCalledWith({
        where: { id: 'message-1' },
      });
      expect(result.attrs?.user_context).toEqual({ language: 'zh-CN' });
      expect(result.attrs?.usage).toBe(rawUsage);
      expect(result.attrs?.usage?.completion_tokens_details.text_tokens).toBe(
        10,
      );
      expect(result.attrs?.usage?.prompt_tokens_details.text_tokens).toBe(795);
      const contextCompact = result.attrs?.usage?.context_compact;
      expect(contextCompact?.estimated_tokens).toBe(123);
      expect(contextCompact?.trigger_tokens).toBe(100000);
      expect(result.status).toBe(MessageStatus.STREAMING);
      expect(messageRepository.save).toHaveBeenCalledWith(message);
    });
  });
});
