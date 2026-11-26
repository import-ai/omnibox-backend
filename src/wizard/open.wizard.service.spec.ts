import { HttpStatus } from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import {
  MessageStatus,
  OpenAIMessageRole,
} from 'omniboxd/messages/entities/message.entity';
import { AgentRequestChannel } from 'omniboxd/wizard/dto/agent-request.dto';
import { OpenWizardService } from 'omniboxd/wizard/open.wizard.service';
import { EntityNotFoundError } from 'typeorm';

describe('OpenWizardService', () => {
  let service: OpenWizardService;
  let streamService: {
    chat: jest.Mock;
    submitConversationMessage: jest.Mock;
    isConversationStreaming: jest.Mock;
    submissionStatus: jest.Mock;
  };
  let messagesService: {
    findOneForUser: jest.Mock;
    findAll: jest.Mock;
    findSubmitted: jest.Mock;
  };
  let conversationsService: {
    create: jest.Mock;
    findOneForUserInNamespace: jest.Mock;
  };

  beforeEach(() => {
    streamService = {
      chat: jest.fn().mockResolvedValue([]),
      submitConversationMessage: jest.fn(),
      isConversationStreaming: jest.fn().mockResolvedValue(false),
      submissionStatus: jest.fn(),
    };
    messagesService = {
      findOneForUser: jest.fn(),
      findAll: jest.fn(),
      findSubmitted: jest.fn(),
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

  it('submits a Bot message through the durable conversation queue', async () => {
    const input = {
      query: 'follow up',
      tools: [],
      source_channel: 'qq',
      client_request_id: 'client',
    };
    streamService.submitConversationMessage.mockResolvedValue({
      disposition: 'queued',
    });
    await expect(
      service.submitBotMessage('u', 'n', 'c', input),
    ).resolves.toMatchObject({ disposition: 'queued' });
    expect(streamService.submitConversationMessage).toHaveBeenCalledWith(
      'n',
      'c',
      'u',
      {
        ...input,
        conversation_id: 'c',
        channel: AgentRequestChannel.OPEN_API,
      },
      undefined,
      true,
    );
  });

  it('exposes the final reply only to the last input in a steered run', async () => {
    const row = (id: string, role: OpenAIMessageRole, parentId?: string) => ({
      id,
      parentId,
      message: { role, content: id },
      status: MessageStatus.SUCCESS,
      attrs: id === 'first' ? {} : { turn_run_id: 'first-request' },
    });
    const first = row('first', OpenAIMessageRole.USER);
    const partial = row('partial', OpenAIMessageRole.ASSISTANT, first.id);
    const next = row('next', OpenAIMessageRole.USER, partial.id);
    const reply = row('final', OpenAIMessageRole.ASSISTANT, next.id);
    messagesService.findAll.mockResolvedValue([first, partial, next, reply]);
    messagesService.findSubmitted
      .mockResolvedValueOnce(first)
      .mockResolvedValue(next);

    await expect(
      service.botMessageResult('u', 'n', 'c', 'first-request'),
    ).resolves.toEqual({ status: 'superseded' });
    await expect(
      service.botMessageResult('u', 'n', 'c', 'next-request'),
    ).resolves.toEqual({
      status: 'complete',
      reply_id: 'final',
      content: 'final',
    });
    streamService.isConversationStreaming.mockResolvedValue(true);
    // A later turn streaming must not hide this input's own final answer.
    await expect(
      service.botMessageResult('u', 'n', 'c', 'next-request'),
    ).resolves.toEqual({
      status: 'complete',
      reply_id: 'final',
      content: 'final',
    });
  });

  it('keeps the requested turn pending while its own answer is still streaming', async () => {
    const input = {
      id: 'input',
      parentId: undefined,
      message: { role: OpenAIMessageRole.USER, content: 'question' },
      status: MessageStatus.SUCCESS,
      attrs: { turn_run_id: 'run' },
    };
    const answer = {
      id: 'answer',
      parentId: 'input',
      message: { role: OpenAIMessageRole.ASSISTANT, content: 'partial' },
      status: MessageStatus.STREAMING,
      attrs: { turn_run_id: 'run' },
    };
    messagesService.findSubmitted.mockResolvedValue(input);
    messagesService.findAll.mockResolvedValue([input, answer]);
    streamService.isConversationStreaming.mockResolvedValue(true);
    await expect(
      service.botMessageResult('u', 'n', 'c', 'run'),
    ).resolves.toEqual({ status: 'pending' });

    streamService.isConversationStreaming.mockResolvedValue(false);
    await expect(
      service.botMessageResult('u', 'n', 'c', 'run'),
    ).resolves.toEqual({ status: 'failed' });
  });

  it('completes a later steer whose own answer is terminal while the run streams', async () => {
    const input = {
      id: 'steer-b',
      parentId: 'answer-a',
      message: { role: OpenAIMessageRole.USER, content: 'second steer' },
      status: MessageStatus.SUCCESS,
      attrs: { turn_run_id: 'run' },
    };
    const firstAnswer = {
      id: 'answer-a',
      parentId: 'input-a',
      message: { role: OpenAIMessageRole.ASSISTANT, content: 'first' },
      status: MessageStatus.SUCCESS,
      attrs: { turn_run_id: 'run' },
    };
    const answerB = {
      id: 'answer-b',
      parentId: 'steer-b',
      message: { role: OpenAIMessageRole.ASSISTANT, content: 'second' },
      status: MessageStatus.SUCCESS,
      attrs: { turn_run_id: 'run' },
    };
    messagesService.findSubmitted.mockResolvedValue(input);
    messagesService.findAll.mockResolvedValue([firstAnswer, input, answerB]);
    streamService.isConversationStreaming.mockResolvedValue(true);
    await expect(
      service.botMessageResult('u', 'n', 'c', 'steer-b'),
    ).resolves.toEqual({
      status: 'complete',
      reply_id: 'answer-b',
      content: 'second',
    });
  });

  it('returns failed for the requested turn while a later turn streams', async () => {
    const input = {
      id: 'failed-input',
      parentId: undefined,
      message: { role: OpenAIMessageRole.USER, content: 'question' },
      status: MessageStatus.SUCCESS,
      attrs: { turn_run_id: 'failed-run' },
    };
    const answer = {
      id: 'failed-answer',
      parentId: 'failed-input',
      message: { role: OpenAIMessageRole.ASSISTANT, content: '' },
      status: MessageStatus.FAILED,
      attrs: { turn_run_id: 'failed-run' },
    };
    messagesService.findSubmitted.mockResolvedValue(input);
    messagesService.findAll.mockResolvedValue([input, answer]);
    streamService.isConversationStreaming.mockResolvedValue(true);
    await expect(
      service.botMessageResult('u', 'n', 'c', 'failed-run'),
    ).resolves.toEqual({ status: 'failed' });
  });
  it('returns stopped for a persisted input even after its receipt expires', async () => {
    messagesService.findSubmitted.mockResolvedValue({
      status: MessageStatus.STOPPED,
    });
    await expect(
      service.botMessageResult('u', 'n', 'c', 'stopped-request'),
    ).resolves.toEqual({ status: 'stopped' });
    expect(streamService.submissionStatus).not.toHaveBeenCalled();
  });

  it('returns stopped for a turn whose run carries a stopped_runs stamp', async () => {
    const input = {
      id: 'stopped-turn-input',
      parentId: undefined,
      message: { role: OpenAIMessageRole.USER, content: 'question' },
      status: MessageStatus.SUCCESS,
      attrs: { turn_run_id: 'run' },
    };
    const stoppedAnswer = {
      id: 'stopped-turn-answer',
      parentId: 'stopped-turn-input',
      message: { role: OpenAIMessageRole.ASSISTANT, content: '' },
      status: MessageStatus.FAILED,
      attrs: { turn_run_id: 'run', stopped_runs: ['run'] },
    };
    messagesService.findSubmitted.mockResolvedValue(input);
    messagesService.findAll.mockResolvedValue([input, stoppedAnswer]);
    // The stamp is this run's terminal outcome, so a later run still
    // streaming does not turn it back into pending.
    streamService.isConversationStreaming.mockResolvedValue(true);
    await expect(
      service.botMessageResult('u', 'n', 'c', 'run'),
    ).resolves.toEqual({ status: 'stopped' });
    expect(streamService.isConversationStreaming).not.toHaveBeenCalled();
  });

  it('keeps a superseded turn superseded even when its run was stopped', async () => {
    const input = {
      id: 'superseded-input',
      parentId: undefined,
      message: { role: OpenAIMessageRole.USER, content: 'question' },
      status: MessageStatus.SUCCESS,
      attrs: { turn_run_id: 'run' },
    };
    const stoppedAnswer = {
      id: 'superseded-answer',
      parentId: 'superseded-input',
      message: { role: OpenAIMessageRole.ASSISTANT, content: '' },
      status: MessageStatus.STOPPED,
      attrs: { turn_run_id: 'run', stopped_runs: ['run'] },
    };
    const next = {
      id: 'next-question',
      parentId: 'superseded-answer',
      message: { role: OpenAIMessageRole.USER, content: 'next' },
      status: MessageStatus.SUCCESS,
      attrs: { turn_run_id: 'run' },
    };
    messagesService.findSubmitted
      .mockResolvedValueOnce(input)
      .mockResolvedValue(next);
    messagesService.findAll.mockResolvedValue([input, stoppedAnswer, next]);
    await expect(
      service.botMessageResult('u', 'n', 'c', 'run'),
    ).resolves.toEqual({ status: 'superseded' });
    // The folded steer's own input is stopped: the original ask is
    // superseded, the steered ask is not.
    await expect(
      service.botMessageResult('u', 'n', 'c', 'run'),
    ).resolves.toEqual({ status: 'stopped' });
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

  it('forwards composer images to the agent request', async () => {
    conversationsService.create.mockResolvedValue({ id: 'conversation-new' });
    const images = [
      {
        attachment_id: '6ba7b810-9dad-41d1-80b4-00c04fd430c8',
        url: '/api/v1/namespaces/ns/conversations/c/attachments/a',
        name: 'image.jpg',
      },
    ];

    await service.ask('user-1', 'namespace-1', 'request-1', {
      query: 'hello',
      tools: [],
      images,
    });

    expect(streamService.chat).toHaveBeenCalledWith(
      'user-1',
      'namespace-1',
      expect.objectContaining({ images }),
      'request-1',
      'ask',
      'explicit',
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

  it.each(['before the reply', 'during the reply', 'after eos'])(
    'returns a stopped response when Web cancels a bot ask %s',
    async (phase) => {
      conversationsService.create.mockResolvedValue({ id: 'conversation-new' });
      const answer = [
        { response_type: 'bos', role: 'assistant', id: 'answer-1' },
        {
          response_type: 'delta',
          id: 'answer-1',
          message: { content: 'Partial answer' },
        },
      ];
      streamService.chat.mockResolvedValue([
        ...(phase === 'before the reply' ? [] : answer),
        ...(phase === 'after eos'
          ? [{ response_type: 'eos', id: 'answer-1' }]
          : []),
        {
          response_type: 'stopped',
          id: phase === 'before the reply' ? undefined : 'answer-1',
        },
      ]);

      await expect(
        service.ask('user-1', 'namespace-1', 'request-1', {
          query: 'hello',
          tools: [],
          source_channel: 'qq',
        }),
      ).resolves.toMatchObject({
        conversation_id: 'conversation-new',
        status: 'stopped',
        messages:
          phase === 'before the reply'
            ? []
            : [
                {
                  id: 'answer-1',
                  role: 'assistant',
                  message: { content: 'Partial answer' },
                },
              ],
      });
    },
  );

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

  it.each(['complete', 'paused'] as const)(
    'merges post-EOS %s timing into the completed message without duplicating it',
    async (status) => {
      conversationsService.create.mockResolvedValue({ id: 'conversation-new' });
      const timing = {
        version: 1,
        answer_id: 'answer',
        run_id: 'run',
        started_at: '2026-11-09T00:00:00Z',
        status,
        duration_ms: 2500,
        ...(status === 'complete'
          ? { completed_at: '2026-11-09T00:00:03Z' }
          : {}),
      };
      const metadata = {
        response_type: 'delta',
        id: 'answer-1',
        message: {},
        attrs: { answer_timing: timing },
      };
      streamService.chat.mockResolvedValue([
        {
          response_type: 'bos',
          role: 'assistant',
          id: 'answer-1',
          parentId: 'query-1',
        },
        {
          response_type: 'delta',
          message: { content: 'answer' },
          attrs: { citations: [{ index: 1 }] },
        },
        { response_type: 'eos', id: 'answer-1' },
        metadata,
        metadata,
        { response_type: 'done' },
      ]);
      const response = await service.ask('user-1', 'namespace-1', 'request-1', {
        query: 'hello',
        tools: [],
      });
      expect(response.messages).toHaveLength(1);
      expect(response.messages[0]).toMatchObject({
        id: 'answer-1',
        message: { content: 'answer' },
        attrs: { citations: [{ index: 1 }], answer_timing: timing },
      });
    },
  );

  it('routes completed-message metadata by message ID', async () => {
    conversationsService.create.mockResolvedValue({ id: 'conversation-new' });
    streamService.chat.mockResolvedValue([
      { response_type: 'bos', role: 'assistant', id: 'first' },
      { response_type: 'eos', id: 'first' },
      { response_type: 'bos', role: 'assistant', id: 'second' },
      { response_type: 'eos', id: 'second' },
      {
        response_type: 'delta',
        id: 'first',
        message: {},
        attrs: { answer_timing: { answer_id: 'first-answer' } },
      },
      { response_type: 'done' },
    ]);
    const response = await service.ask('user-1', 'namespace-1', 'request-1', {
      query: 'hello',
      tools: [],
    });
    expect(response.messages[0].attrs.answer_timing.answer_id).toBe(
      'first-answer',
    );
    expect(response.messages[1].attrs.answer_timing).toBeUndefined();
  });

  it.each([
    { id: 'unknown', message: {}, attrs: { answer_timing: {} } },
    { id: 'answer-1', message: { content: 'late text' }, attrs: {} },
  ])('rejects invalid post-EOS deltas %#', async (delta) => {
    conversationsService.create.mockResolvedValue({ id: 'conversation-new' });
    streamService.chat.mockResolvedValue([
      { response_type: 'bos', role: 'assistant', id: 'answer-1' },
      { response_type: 'eos', id: 'answer-1' },
      { response_type: 'delta', ...delta },
      { response_type: 'done' },
    ]);
    await expect(
      service.ask('user-1', 'namespace-1', 'request-1', {
        query: 'hello',
        tools: [],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE_TYPE' });
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
