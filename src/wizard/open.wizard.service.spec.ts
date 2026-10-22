import { HttpStatus } from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { AgentRequestChannel } from 'omniboxd/wizard/dto/agent-request.dto';
import { OpenWizardService } from 'omniboxd/wizard/open.wizard.service';
import { EntityNotFoundError } from 'typeorm';

describe('OpenWizardService', () => {
  let service: OpenWizardService;
  let streamService: { chat: jest.Mock };
  let messagesService: { findOneForUser: jest.Mock };
  let conversationsService: {
    create: jest.Mock;
    findOneForUserInNamespace: jest.Mock;
  };

  beforeEach(() => {
    streamService = {
      chat: jest.fn().mockResolvedValue([]),
    };
    messagesService = {
      findOneForUser: jest.fn(),
    };
    conversationsService = {
      create: jest.fn(),
      findOneForUserInNamespace: jest.fn(),
    };

    service = new OpenWizardService(
      {} as any,
      streamService as any,
      messagesService as any,
      conversationsService as any,
      { t: jest.fn(() => 'Message not found') } as any,
    );
  });

  it('creates a new conversation when parent_message_id is absent', async () => {
    conversationsService.create.mockResolvedValue({ id: 'conversation-new' });

    await service.ask('user-1', 'namespace-1', 'request-1', {
      query: 'hello',
      tools: [],
    });

    expect(conversationsService.create).toHaveBeenCalledWith(
      'namespace-1',
      'user-1',
    );
    expect(messagesService.findOneForUser).not.toHaveBeenCalled();
    expect(streamService.chat).toHaveBeenCalledWith(
      'user-1',
      'namespace-1',
      expect.objectContaining({
        conversation_id: 'conversation-new',
        channel: AgentRequestChannel.OPEN_API,
        enable_thinking: false,
      }),
      'request-1',
      'ask',
      'explicit',
    );
  });

  it('follows the latest message when only conversation_id is set', async () => {
    conversationsService.findOneForUserInNamespace.mockResolvedValue({
      id: 'conversation-1',
    });
    streamService.chat.mockResolvedValue([
      {
        response_type: 'bos',
        id: 'assistant-1',
        role: 'assistant',
        parentId: 'message-1',
      },
      { response_type: 'eos' },
    ]);

    const response = await service.ask('user-1', 'namespace-1', 'request-1', {
      query: 'hello',
      tools: [],
      conversation_id: 'conversation-1',
    });

    expect(conversationsService.create).not.toHaveBeenCalled();
    expect(messagesService.findOneForUser).not.toHaveBeenCalled();
    expect(streamService.chat).toHaveBeenCalledWith(
      'user-1',
      'namespace-1',
      expect.objectContaining({ conversation_id: 'conversation-1' }),
      'request-1',
      'ask',
      'latest',
    );
    expect(response).toMatchObject({ conversation_id: 'conversation-1' });
  });

  it('forwards the messaging channel without changing the API surface', async () => {
    conversationsService.findOneForUserInNamespace.mockResolvedValue({
      id: 'conversation-1',
    });

    await service.ask('user-1', 'namespace-1', 'request-1', {
      query: 'hello',
      tools: [],
      conversation_id: 'conversation-1',
      source_channel: 'qq',
    });

    expect(streamService.chat).toHaveBeenCalledWith(
      'user-1',
      'namespace-1',
      expect.objectContaining({
        channel: AgentRequestChannel.OPEN_API,
        source_channel: 'qq',
      }),
      'request-1',
      'ask',
      'latest',
    );
  });

  it('ignores follow_latest from the public API', async () => {
    messagesService.findOneForUser.mockResolvedValue({
      id: 'message-1',
      conversationId: 'conversation-1',
    });
    conversationsService.findOneForUserInNamespace.mockResolvedValue({
      id: 'conversation-1',
    });

    await service.ask('user-1', 'namespace-1', 'request-1', {
      query: 'hello',
      tools: [],
      parent_message_id: 'message-1',
      follow_latest: true,
    } as never);

    const request = streamService.chat.mock.calls[0][2];
    expect(request.parent_message_id).toBe('message-1');
    expect(request.follow_latest).toBeUndefined();
  });

  it('keeps an explicit parent when conversation_id is also set', async () => {
    messagesService.findOneForUser.mockResolvedValue({
      id: 'message-1',
      conversationId: 'conversation-1',
    });
    conversationsService.findOneForUserInNamespace.mockResolvedValue({
      id: 'conversation-1',
    });

    await service.ask('user-1', 'namespace-1', 'request-1', {
      query: '/approve',
      tools: [],
      conversation_id: 'conversation-1',
      parent_message_id: 'message-1',
    });

    expect(streamService.chat).toHaveBeenCalledWith(
      'user-1',
      'namespace-1',
      expect.objectContaining({
        conversation_id: 'conversation-1',
        parent_message_id: 'message-1',
      }),
      'request-1',
      'ask',
      'explicit',
    );
  });

  it('rejects a parent from another conversation', async () => {
    messagesService.findOneForUser.mockResolvedValue({
      id: 'message-1',
      conversationId: 'conversation-2',
    });
    conversationsService.findOneForUserInNamespace.mockResolvedValue({
      id: 'conversation-2',
    });

    await expect(
      service.ask('user-1', 'namespace-1', 'request-1', {
        query: 'hello',
        tools: [],
        conversation_id: 'conversation-1',
        parent_message_id: 'message-1',
      }),
    ).rejects.toMatchObject({ code: 'PARENT_CONVERSATION_MISMATCH' });
    expect(streamService.chat).not.toHaveBeenCalled();
  });

  it('denies a conversation_id the user cannot access', async () => {
    conversationsService.findOneForUserInNamespace.mockRejectedValue(
      new AppException(
        'denied',
        'CONVERSATION_ACCESS_DENIED',
        HttpStatus.FORBIDDEN,
      ),
    );

    await expect(
      service.ask('user-1', 'namespace-1', 'request-1', {
        query: 'hello',
        tools: [],
        conversation_id: 'conversation-1',
      }),
    ).rejects.toMatchObject({ code: 'CONVERSATION_ACCESS_DENIED' });
    expect(streamService.chat).not.toHaveBeenCalled();
  });

  it('reuses the parent message conversation only within the current user and namespace', async () => {
    messagesService.findOneForUser.mockResolvedValue({
      id: 'message-1',
      conversationId: 'conversation-1',
    });
    conversationsService.findOneForUserInNamespace.mockResolvedValue({
      id: 'conversation-1',
    });

    await service.ask('user-1', 'namespace-1', 'request-1', {
      query: 'hello',
      tools: [],
      parent_message_id: 'message-1',
    });

    expect(messagesService.findOneForUser).toHaveBeenCalledWith(
      'message-1',
      'user-1',
    );
    expect(conversationsService.findOneForUserInNamespace).toHaveBeenCalledWith(
      'conversation-1',
      'user-1',
      'namespace-1',
    );
    expect(streamService.chat).toHaveBeenCalledWith(
      'user-1',
      'namespace-1',
      expect.objectContaining({
        conversation_id: 'conversation-1',
        parent_message_id: 'message-1',
        channel: AgentRequestChannel.OPEN_API,
      }),
      'request-1',
      'ask',
      'explicit',
    );
  });

  it('ignores metrics while preserving the complete answer', async () => {
    conversationsService.create.mockResolvedValue({ id: 'conversation-new' });
    streamService.chat.mockResolvedValue([
      { response_type: 'metrics', tokens: 0, tps: 0 },
      {
        response_type: 'bos',
        role: 'assistant',
        id: 'answer-1',
        parentId: 'query-1',
      },
      {
        response_type: 'delta',
        message: { reasoning_content: 'Thinking', content: 'Hello' },
        attrs: { context: { provider: 'agent' } },
      },
      { response_type: 'metrics', tokens: 2, tps: 1.5 },
      { response_type: 'delta', message: { content: ' world' } },
      { response_type: 'metrics', tokens: 3, tps: 2 },
      { response_type: 'eos', role: 'assistant', id: 'answer-1' },
      { response_type: 'metrics', tokens: 3, tps: 0 },
      { response_type: 'done' },
    ]);

    await expect(
      service.ask('user-1', 'namespace-1', 'request-1', {
        query: 'hello',
        tools: [],
      }),
    ).resolves.toEqual({
      messages: [
        {
          id: 'answer-1',
          role: 'assistant',
          parent_id: 'query-1',
          message: {
            role: 'assistant',
            reasoning_content: 'Thinking',
            content: 'Hello world',
          },
          attrs: { context: { provider: 'agent' } },
        },
      ],
      conversation_id: 'conversation-new',
    });
  });

  it.each([
    [
      'keeps INSUFFICIENT_AGENT_CREDITS as a 403',
      { code: 'INSUFFICIENT_AGENT_CREDITS' },
      'INSUFFICIENT_AGENT_CREDITS',
      HttpStatus.FORBIDDEN,
    ],
    [
      'keeps any other stream error code as a 502',
      { code: 'SOMETHING_ELSE' },
      'SOMETHING_ELSE',
      HttpStatus.BAD_GATEWAY,
    ],
    [
      'reports a stream error without a code as WIZARD_STREAM_ERROR',
      {},
      'WIZARD_STREAM_ERROR',
      HttpStatus.BAD_GATEWAY,
    ],
  ])('%s', async (_name, extra, code, status) => {
    conversationsService.create.mockResolvedValue({ id: 'conversation-new' });
    streamService.chat.mockResolvedValue([
      { response_type: 'bos', role: 'assistant', id: 'answer-1' },
      { response_type: 'error', message: 'stream failed', ...extra },
    ]);

    const error: AppException = await service
      .ask('user-1', 'namespace-1', 'request-1', { query: 'hi', tools: [] })
      .catch((e: AppException) => e);

    expect(error).toBeInstanceOf(AppException);
    expect(error.code).toBe(code);
    expect(error.getStatus()).toBe(status);
    expect(error.message).toBe('stream failed');
  });

  it('passes edition through to the agent request', async () => {
    conversationsService.create.mockResolvedValue({ id: 'conversation-new' });

    await service.ask('user-1', 'namespace-1', 'request-1', {
      query: 'hi',
      tools: [],
      edition: 'pro',
    });

    expect(streamService.chat).toHaveBeenCalledWith(
      'user-1',
      'namespace-1',
      expect.objectContaining({ edition: 'pro' }),
      'request-1',
      'ask',
      'explicit',
    );
  });

  it('rejects parent messages owned by another user', async () => {
    messagesService.findOneForUser.mockRejectedValue(
      new EntityNotFoundError('Message', { id: 'message-1' }),
    );

    await expect(
      service.ask('user-1', 'namespace-1', 'request-1', {
        query: 'hello',
        tools: [],
        parent_message_id: 'message-1',
      }),
    ).rejects.toMatchObject({
      code: 'PARENT_MESSAGE_NOT_FOUND',
    });

    await expect(
      service.ask('user-1', 'namespace-1', 'request-2', {
        query: 'hello',
        tools: [],
        parent_message_id: 'message-1',
      }),
    ).rejects.toBeInstanceOf(AppException);
    expect(streamService.chat).not.toHaveBeenCalled();
  });

  it('rejects parent messages from conversations outside the current namespace', async () => {
    messagesService.findOneForUser.mockResolvedValue({
      id: 'message-1',
      conversationId: 'conversation-1',
    });
    conversationsService.findOneForUserInNamespace.mockRejectedValue(
      new EntityNotFoundError('Conversation', { id: 'conversation-1' }),
    );

    try {
      await service.ask('user-1', 'namespace-1', 'request-1', {
        query: 'hello',
        tools: [],
        parent_message_id: 'message-1',
      });
      fail('Expected ask to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).code).toBe('PARENT_MESSAGE_NOT_FOUND');
      expect((error as AppException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    }

    expect(streamService.chat).not.toHaveBeenCalled();
  });
});
