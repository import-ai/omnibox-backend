import {
  BadRequestException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { ConversationsService } from 'omniboxd/conversations/conversations.service';
import {
  MessageStatus,
  OpenAIMessageRole,
} from 'omniboxd/messages/entities/message.entity';
import { MessagesService } from 'omniboxd/messages/messages.service';
import {
  AgentRequestChannel,
  AgentRequestDto,
} from 'omniboxd/wizard/dto/agent-request.dto';
import { ChatResponse } from 'omniboxd/wizard/dto/chat-response.dto';
import {
  OpenAgentRequestDto,
  OpenConversationMessageDto,
} from 'omniboxd/wizard/dto/open-agent-request.dto';
import { StreamService } from 'omniboxd/wizard/stream.service';
import { WizardService } from 'omniboxd/wizard/wizard.service';
import { EntityNotFoundError } from 'typeorm';

@Injectable()
export class OpenWizardService {
  constructor(
    private readonly wizardService: WizardService,
    private readonly streamService: StreamService,
    private readonly messagesService: MessagesService,
    private readonly conversationsService: ConversationsService,
    private readonly i18n: I18nService,
  ) {}

  protected translate(key: string): string {
    return this.i18n.t(key);
  }

  async createBotConversation(
    userId: string,
    namespaceId: string,
    parentId?: string,
  ) {
    if (parentId !== undefined && !isUUID(parentId))
      throw new BadRequestException('Invalid parent message ID');
    const { conversationId } = await this.resolveConversation(
      userId,
      namespaceId,
      undefined,
      parentId,
    );
    return { conversation_id: conversationId };
  }

  submitBotMessage(
    userId: string,
    namespaceId: string,
    conversationId: string,
    data: OpenConversationMessageDto,
  ) {
    const {
      query,
      tools,
      images,
      lang,
      enable_thinking,
      client_request_id,
      source_channel,
    } = data;
    return this.streamService.submitConversationMessage(
      namespaceId,
      conversationId,
      userId,
      {
        conversation_id: conversationId,
        channel: AgentRequestChannel.OPEN_API,
        query,
        tools,
        images,
        lang,
        enable_thinking,
        client_request_id,
        source_channel,
      },
      undefined,
      true,
    );
  }

  async botMessageResult(
    userId: string,
    namespaceId: string,
    conversationId: string,
    requestId: string,
  ) {
    await this.conversationsService.findOneForUserInNamespace(
      conversationId,
      userId,
      namespaceId,
    );
    const input = await this.messagesService.findSubmitted(
      userId,
      conversationId,
      requestId,
    );
    if (input?.status === MessageStatus.STOPPED) return { status: 'stopped' };
    if (!input || input.status !== MessageStatus.SUCCESS) {
      const receipt = await this.streamService.submissionStatus(
        namespaceId,
        conversationId,
        userId,
        requestId,
      );
      if (!receipt || Array.isArray(receipt))
        throw new NotFoundException('Message not found');
      return {
        status: receipt.disposition === 'failed' ? 'failed' : 'pending',
      };
    }
    if (
      await this.streamService.isConversationStreaming(
        namespaceId,
        conversationId,
        userId,
      )
    )
      return { status: 'pending' };

    const rows = await this.messagesService.findAll(userId, conversationId);
    const parentOf = new Map(rows.map((row) => [row.id, row.parentId]));
    const follows = (id: string, ancestor: string) => {
      for (
        let parent = parentOf.get(id);
        parent;
        parent = parentOf.get(parent)
      ) {
        if (parent === ancestor) return true;
      }
      return false;
    };
    const runId = input.attrs?.turn_run_id ?? requestId;
    const runRows = rows.filter((row) => row.attrs?.turn_run_id === runId);
    if (
      runRows.some(
        (row) =>
          row.message.role === OpenAIMessageRole.USER &&
          follows(row.id, input.id),
      )
    )
      return { status: 'superseded' };
    if (rows.some((row) => row.attrs?.stopped_runs?.includes(runId)))
      return { status: 'stopped' };

    let answer = runRows.findLast(
      (row) =>
        row.message.role === OpenAIMessageRole.ASSISTANT &&
        follows(row.id, input.id),
    );
    // An approval opens another run. Follow its decision branch, never a later question.
    while (answer?.attrs?.tool_call?.interrupts?.length) {
      const decision = rows.findLast(
        (row) =>
          row.parentId === answer!.id &&
          row.attrs?.tool_call?.decisions?.length,
      );
      if (!decision)
        return {
          status: 'approval',
          reply_id: answer.id,
          interrupts: answer.attrs.tool_call.interrupts,
        };
      if (decision.attrs?.tool_call?.decisions?.some((item) => item.end_turn))
        return { status: 'superseded' };
      answer = rows.findLast(
        (row) =>
          row.attrs?.turn_id === decision.id &&
          row.message.role === OpenAIMessageRole.ASSISTANT,
      );
    }
    if (answer?.status === MessageStatus.STOPPED) return { status: 'stopped' };
    if (
      answer?.status !== MessageStatus.SUCCESS ||
      !answer.message.content ||
      answer.message.tool_calls?.length
    )
      return { status: 'failed' };
    return {
      status: 'complete',
      reply_id: answer.id,
      content: answer.message.content,
    };
  }

  async ask(
    userId: string,
    namespaceId: string,
    requestId: string,
    data: OpenAgentRequestDto,
  ): Promise<any> {
    const resolved = await this.resolveConversation(
      userId,
      namespaceId,
      data.conversation_id,
      data.parent_message_id,
    );

    const agentRequest: AgentRequestDto = {
      ...data,
      conversation_id: resolved.conversationId,
      enable_thinking: data.enable_thinking ?? false,
      channel: AgentRequestChannel.OPEN_API,
      source_channel: data.source_channel,
      // Only the web composer may ask to follow the newest message; the
      // public API keeps the parent it was given.
      follow_latest: undefined,
    };

    const chunks: ChatResponse[] = await this.streamService.chat(
      userId,
      namespaceId,
      agentRequest,
      requestId,
      'ask',
      resolved.parentMode,
    );

    return this.mergeChunks(chunks, resolved.conversationId);
  }

  private async resolveConversation(
    userId: string,
    namespaceId: string,
    conversationId?: string,
    parentMessageId?: string,
  ): Promise<{ conversationId: string; parentMode: 'latest' | 'explicit' }> {
    if (conversationId && !parentMessageId) {
      await this.conversationsService.findOneForUserInNamespace(
        conversationId,
        userId,
        namespaceId,
      );
      return { conversationId, parentMode: 'latest' };
    }

    if (parentMessageId) {
      const parentMessage = await this.findParentMessage(
        parentMessageId,
        userId,
      );
      let conversation;
      try {
        conversation =
          await this.conversationsService.findOneForUserInNamespace(
            parentMessage.conversationId,
            userId,
            namespaceId,
          );
      } catch (error) {
        if (!(error instanceof EntityNotFoundError)) {
          throw error;
        }
        throw new AppException(
          this.i18n.t('system.errors.messageNotFound'),
          'PARENT_MESSAGE_NOT_FOUND',
          HttpStatus.NOT_FOUND,
        );
      }
      if (conversationId && conversation.id !== conversationId) {
        throw new AppException(
          this.i18n.t('system.errors.parentConversationMismatch'),
          'PARENT_CONVERSATION_MISMATCH',
          HttpStatus.BAD_REQUEST,
        );
      }
      return { conversationId: conversation.id, parentMode: 'explicit' };
    }

    const conversation = await this.conversationsService.create(
      namespaceId,
      userId,
    );
    return { conversationId: conversation.id, parentMode: 'explicit' };
  }

  private async findParentMessage(parentMessageId: string, userId: string) {
    try {
      return await this.messagesService.findOneForUser(parentMessageId, userId);
    } catch (error) {
      if (!(error instanceof EntityNotFoundError)) {
        throw error;
      }
      throw new AppException(
        this.i18n.t('system.errors.messageNotFound'),
        'PARENT_MESSAGE_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
  }

  private mergeChunks(chunks: ChatResponse[], conversationId: string) {
    const messages: any[] = [];
    let currentMessage: any = null;

    for (const chunk of chunks) {
      if (chunk.response_type === 'metrics') {
        continue;
      }
      if (chunk.response_type === 'stopped') {
        if (currentMessage) messages.push(currentMessage);
        return { messages, conversation_id: conversationId, status: 'stopped' };
      }
      if (
        chunk.response_type === 'delta' &&
        !currentMessage &&
        chunk.id &&
        Object.keys(chunk.message).length === 0
      ) {
        const completed = messages.find((message) => message.id === chunk.id);
        if (completed) {
          completed.attrs = { ...completed.attrs, ...chunk.attrs };
          continue;
        }
      }
      if (chunk.response_type === 'bos') {
        const bosChunk = chunk;
        currentMessage = {
          id: bosChunk.id,
          role: bosChunk.role,
          parent_id: bosChunk.parentId,
          message: {
            role: bosChunk.role,
          },
          attrs: {},
        };
      } else if (chunk.response_type === 'delta' && currentMessage) {
        const deltaChunk = chunk;
        if (deltaChunk.message.content) {
          currentMessage.message.content =
            (currentMessage.message.content || '') + deltaChunk.message.content;
        }
        if (deltaChunk.message.reasoning_content) {
          currentMessage.message.reasoning_content =
            (currentMessage.message.reasoning_content || '') +
            deltaChunk.message.reasoning_content;
        }
        if (deltaChunk.message.tool_calls) {
          currentMessage.message.tool_calls = deltaChunk.message.tool_calls;
        }
        if (deltaChunk.message.tool_call_id) {
          currentMessage.message.tool_call_id = deltaChunk.message.tool_call_id;
        }
        if (deltaChunk.attrs) {
          currentMessage.attrs = {
            ...currentMessage.attrs,
            ...deltaChunk.attrs,
          };
        }
      } else if (chunk.response_type === 'eos' && currentMessage) {
        messages.push(currentMessage);
        currentMessage = null;
      } else if (chunk.response_type === 'done') {
        // Done
      } else {
        const message = this.i18n.t('system.errors.invalidResponseType', {
          args: { responseType: chunk.response_type },
        });
        throw new AppException(
          message,
          'INVALID_RESPONSE_TYPE',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }

    return { messages, conversation_id: conversationId };
  }
}
