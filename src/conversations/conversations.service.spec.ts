import { I18nService } from 'nestjs-i18n';
import {
  Message,
  OpenAIMessageRole,
} from 'omniboxd/messages/entities/message.entity';
import { MessagesService } from 'omniboxd/messages/messages.service';

import { ConversationsService } from './conversations.service';
import { Conversation } from './entities/conversation.entity';

describe('ConversationsService', () => {
  const messagesService = {
    findAll: jest.fn(),
  };
  const service = new ConversationsService(
    {} as any,
    {} as any,
    messagesService as unknown as MessagesService,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as unknown as I18nService,
  );
  const conversation = {
    id: 'conversation-id',
    title: 'Conversation title',
    createdAt: new Date('2026-08-20T00:00:00.000Z'),
    updatedAt: new Date('2026-08-21T00:00:00.000Z'),
  } as Conversation;

  function message(
    id: string,
    role: OpenAIMessageRole,
    content?: string,
    values?: Partial<Message['message']>,
  ): Message {
    return {
      id,
      parentId: null,
      message: { role, content, ...values },
    } as Message;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the last valid user or assistant message', async () => {
    jest
      .spyOn(service, 'compose')
      .mockResolvedValue([
        message('user-1', OpenAIMessageRole.USER, 'First question'),
        message('assistant-1', OpenAIMessageRole.ASSISTANT, 'First answer'),
        message('user-2', OpenAIMessageRole.USER, 'Latest question'),
      ]);

    await expect(service.getSummary('user-id', conversation)).resolves.toEqual(
      expect.objectContaining({
        last_message: {
          role: OpenAIMessageRole.USER,
          content: 'Latest question',
        },
      }),
    );
  });

  it('ignores system, tool, empty, and tool-call assistant messages', async () => {
    jest.spyOn(service, 'compose').mockResolvedValue([
      message('user-1', OpenAIMessageRole.USER, 'Question'),
      message('assistant-1', OpenAIMessageRole.ASSISTANT, 'Final answer'),
      message('system-1', OpenAIMessageRole.SYSTEM, 'System prompt'),
      message('tool-1', OpenAIMessageRole.TOOL, 'Tool response'),
      message('assistant-2', OpenAIMessageRole.ASSISTANT, '   '),
      message('assistant-3', OpenAIMessageRole.ASSISTANT, 'Calling tool', {
        tool_calls: [{ id: 'tool-call-id' }],
      }),
    ]);

    await expect(service.getSummary('user-id', conversation)).resolves.toEqual(
      expect.objectContaining({
        last_message: {
          role: OpenAIMessageRole.ASSISTANT,
          content: 'Final answer',
        },
      }),
    );
  });
});
