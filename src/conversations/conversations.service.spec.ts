import { I18nService } from 'nestjs-i18n';
import {
  Message,
  OpenAIMessageRole,
} from 'omniboxd/messages/entities/message.entity';
import { MessagesService } from 'omniboxd/messages/messages.service';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';
import { WizardAPIService } from 'omniboxd/wizard-api/wizard-api.service';

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

  it('hides internal context without mutating stored attributes', async () => {
    jest
      .spyOn(service, 'findOneForUserInNamespace')
      .mockResolvedValue(conversation);
    const row = {
      ...message('attempt', OpenAIMessageRole.ASSISTANT, 'Editing memory'),
      createdAt: new Date(),
      attrs: {
        context: { memory_write_attempt: true, checkpoint: 'private-state' },
      },
    };
    messagesService.findAll.mockResolvedValue([row]);
    const publicDetail = await service.getConversationForUser(
      'n',
      conversation.id,
      'u',
    );
    expect(publicDetail.mapping.attempt.attrs?.context).toBeUndefined();
    expect(row.attrs.context.checkpoint).toBe('private-state');
    expect(row.attrs.context.memory_write_attempt).toBe(true);
  });

  it('keeps a title renamed while generation is in flight', async () => {
    const stored = {
      id: 'conversation-id',
      namespaceId: 'namespace-id',
      userId: 'user-id',
      title: '',
      createdAt: new Date('2026-10-14T01:40:00.000Z'),
      updatedAt: new Date('2026-10-14T01:40:00.000Z'),
    };
    const repository = {
      findOne: jest.fn(() => ({ ...stored })),
      update: jest.fn(
        (criteria: { title?: string }, partial: { title: string }) => {
          if (criteria.title === '' && stored.title === '') {
            stored.title = partial.title;
            return { affected: 1 };
          }
          return { affected: 0 };
        },
      ),
      save: jest.fn((entity: { title: string }) => {
        stored.title = entity.title;
        return entity;
      }),
    };
    const wizardApiService = {
      createTitle: jest.fn(() => {
        stored.title = '用户改名';
        return { title: '简短问候' };
      }),
    };
    const titleService = new ConversationsService(
      repository as never,
      {} as never,
      {
        findAll: jest
          .fn()
          .mockResolvedValue([
            message('user-1', OpenAIMessageRole.USER, '你好'),
          ]),
      } as unknown as MessagesService,
      { getMe: jest.fn() } as unknown as NamespacesService,
      {} as never,
      wizardApiService as unknown as WizardAPIService,
      {} as never,
      {} as never,
      { t: (key: string) => key } as unknown as I18nService,
    );

    await expect(
      titleService.createTitle('namespace-id', 'conversation-id', 'user-id'),
    ).resolves.toEqual({ title: '用户改名' });
    expect(repository.save).not.toHaveBeenCalled();
    expect(stored.title).toBe('用户改名');
  });

  it('saves a generated title while the conversation title is still empty', async () => {
    const stored = {
      id: 'conversation-id',
      namespaceId: 'namespace-id',
      userId: 'user-id',
      title: '',
      createdAt: new Date('2026-10-14T01:40:00.000Z'),
      updatedAt: new Date('2026-10-14T01:40:00.000Z'),
    };
    const repository = {
      findOne: jest.fn(() => ({ ...stored })),
      update: jest.fn(
        (criteria: { title?: string }, partial: { title: string }) => {
          if (criteria.title === '' && stored.title === '') {
            stored.title = partial.title;
            return { affected: 1 };
          }
          return { affected: 0 };
        },
      ),
      save: jest.fn(),
    };
    const titleService = new ConversationsService(
      repository as never,
      {} as never,
      {
        findAll: jest
          .fn()
          .mockResolvedValue([
            message('user-1', OpenAIMessageRole.USER, '你好'),
          ]),
      } as unknown as MessagesService,
      { getMe: jest.fn() } as unknown as NamespacesService,
      {} as never,
      {
        createTitle: jest.fn().mockResolvedValue({ title: '简短问候' }),
      } as unknown as WizardAPIService,
      {} as never,
      {} as never,
      { t: (key: string) => key } as unknown as I18nService,
    );

    await expect(
      titleService.createTitle('namespace-id', 'conversation-id', 'user-id'),
    ).resolves.toEqual({ title: '简短问候' });
    expect(repository.save).not.toHaveBeenCalled();
    expect(repository.update).toHaveBeenCalledWith(
      {
        id: 'conversation-id',
        userId: 'user-id',
        namespaceId: 'namespace-id',
        title: '',
      },
      { title: '简短问候' },
    );
    expect(stored.title).toBe('简短问候');
  });
});
