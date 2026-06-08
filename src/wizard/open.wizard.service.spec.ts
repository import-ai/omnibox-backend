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
    );
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
