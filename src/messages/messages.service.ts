import { isDeepStrictEqual } from 'node:util';

import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { ConversationAttachment } from 'omniboxd/attachments/entities/conversation-attachment.entity';
import { MessageAttachment } from 'omniboxd/attachments/entities/message-attachment.entity';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { Conversation } from 'omniboxd/conversations/entities/conversation.entity';
import { agentTokenDeltaOf } from 'omniboxd/messages/agent-token-usage';
import { CreateMessageDto } from 'omniboxd/messages/dto/create-message.dto';
import {
  Message,
  MessageStatus,
  OpenAIMessage,
} from 'omniboxd/messages/entities/message.entity';
import { queryTime } from 'omniboxd/messages/query-time';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';
import { WizardTaskService } from 'omniboxd/tasks/wizard-task.service';
import { User } from 'omniboxd/user/entities/user.entity';
import { transaction } from 'omniboxd/utils/transaction-utils';
import { DataSource, In, IsNull, MoreThan, Not, Repository } from 'typeorm';

import {
  ChatCheckpointResponse,
  ChatDeltaResponse,
} from '../wizard/dto/chat-response.dto';

const TASK_PRIORITY = 5;

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
    @InjectRepository(Conversation)
    private readonly conversationRepository: Repository<Conversation>,
    private readonly dataSource: DataSource,
    private readonly wizardTaskService: WizardTaskService,
    private readonly namespacesService: NamespacesService,
    private readonly i18n: I18nService,
  ) {}

  async create(
    namespaceId: string,
    conversationId: string,
    userId: string | null,
    dto: CreateMessageDto,
    index: boolean = true,
    queryOptions?: { timeZone?: string; clientRequestId?: string },
  ): Promise<Message & { reused?: boolean }> {
    if (userId) {
      await this.namespacesService.getMe(namespaceId, userId);
      const ownsConversation = await this.conversationRepository.existsBy({
        id: conversationId,
        namespaceId,
        userId,
      });
      if (!ownsConversation) {
        throw new AppException(
          this.i18n.t('conversation.errors.accessDenied'),
          'CONVERSATION_ACCESS_DENIED',
          HttpStatus.FORBIDDEN,
        );
      }
    }
    const message = this.messageRepository.create({
      message: dto.message,
      conversationId,
      userId,
      parentId: dto.parentId,
      attrs: dto.attrs,
      status: dto.status,
    });
    return await transaction(this.dataSource.manager, async (tx) => {
      const manager = tx.entityManager;
      if (queryOptions?.clientRequestId) {
        await manager.getRepository(Conversation).findOneOrFail({
          where: { id: conversationId, namespaceId },
          lock: { mode: 'pessimistic_write' },
        });
        // ponytail: scan one conversation's messages; index the JSON key if histories grow large.
        const existing = await manager
          .getRepository(Message)
          .createQueryBuilder('message')
          .where('message.conversationId = :conversationId', { conversationId })
          .andWhere(
            "message.attrs ->> 'client_request_id' = :clientRequestId",
            queryOptions,
          )
          .getOne();
        if (existing) {
          if (
            existing.userId !== userId ||
            existing.parentId !== (dto.parentId || null) ||
            !isDeepStrictEqual(existing.message, dto.message) ||
            !isDeepStrictEqual(
              existing.attrs?.tool_call,
              dto.attrs?.tool_call,
            ) ||
            !isDeepStrictEqual(existing.attrs?.composer, dto.attrs?.composer)
          ) {
            throw new AppException(
              this.i18n.t('system.errors.wizardRequestFailed'),
              'QUERY_REQUEST_CONFLICT',
              HttpStatus.CONFLICT,
            );
          }
          return Object.assign(existing, { reused: true });
        }
        message.attrs = {
          ...message.attrs,
          client_request_id: queryOptions.clientRequestId,
        };
      }
      const savedMsg = await manager.save(message);
      if (queryOptions && !dto.attrs?.tool_call?.decisions?.length) {
        savedMsg.attrs = {
          ...savedMsg.attrs,
          user_context: {
            ...savedMsg.attrs?.user_context,
            created_at: queryTime(savedMsg.createdAt, queryOptions.timeZone),
          },
        };
        await manager.save(savedMsg);
      }
      const images =
        (dto.attrs as any)?.composer?.display_parts?.filter(
          (part: any) => part.type === 'image' && part.attachment_id,
        ) ?? [];
      if (images.length > 0) {
        const attachmentIds = images.map((part: any) => part.attachment_id);
        const ownership = {
          id: In(attachmentIds),
          namespaceId,
          conversationId,
          userId: userId ?? '',
        };
        const attachments = await manager
          .getRepository(ConversationAttachment)
          .find({
            where: [
              { ...ownership, consumedAt: Not(IsNull()) },
              {
                ...ownership,
                consumedAt: IsNull(),
                expiresAt: MoreThan(new Date()),
              },
            ],
            order: { id: 'ASC' },
            lock: { mode: 'pessimistic_write' },
          });
        if (attachments.length !== new Set(attachmentIds).size) {
          throw new AppException(
            this.i18n.t('attachment.errors.conversationAttachmentUnavailable'),
            'CONVERSATION_ATTACHMENT_ACCESS_DENIED',
            HttpStatus.FORBIDDEN,
          );
        }
        await manager.save(
          images.map((part: any, position: number) =>
            manager.getRepository(MessageAttachment).create({
              messageId: savedMsg.id,
              attachmentId: part.attachment_id,
              position,
            }),
          ),
        );
        const consumedAt = new Date();
        for (const attachment of attachments) {
          attachment.consumedAt ??= consumedAt;
        }
        await manager.save(attachments);
      }
      if (index && userId) {
        await this.wizardTaskService.emitUpsertMessageIndexTask(
          TASK_PRIORITY,
          userId,
          namespaceId,
          conversationId,
          savedMsg,
          tx,
        );
      }
      return savedMsg;
    });
  }

  async update(
    id: string,
    namespaceId: string,
    conversationId: string,
    dto: Partial<CreateMessageDto>,
    index: boolean = true,
  ): Promise<Message> {
    const message = await this.messageRepository.findOneOrFail({
      where: { id },
    });
    Object.assign(message, dto);
    return await transaction(this.dataSource.manager, async (tx) => {
      const manager = tx.entityManager;
      const updatedMsg = await manager.save(message);
      if (index && message.userId) {
        await this.wizardTaskService.emitUpsertMessageIndexTask(
          TASK_PRIORITY,
          message.userId,
          namespaceId,
          conversationId,
          message,
          tx,
        );
      }
      return updatedMsg;
    });
  }

  add(source?: string, delta?: string): string | undefined {
    return delta ? (source || '') + delta : source;
  }

  async saveCheckpoint(id: string, chunk: ChatCheckpointResponse) {
    if (chunk.checkpoint) {
      const message = await this.messageRepository.findOneOrFail({
        where: { id },
      });

      message.attrs = message.attrs || {};
      message.attrs.context = message.attrs.context || {};
      message.attrs.context = {
        ...message.attrs.context,
        checkpoint: chunk.checkpoint,
      };
      message.status = MessageStatus.SUCCESS;
      return await this.messageRepository.save(message);
    }
  }

  async updateDelta(id: string, delta: ChatDeltaResponse) {
    const deltaMessage: Partial<OpenAIMessage> = delta.message;

    const message = await this.messageRepository.findOneOrFail({
      where: { id },
    });
    if (
      [
        MessageStatus.SUCCESS,
        MessageStatus.STOPPED,
        MessageStatus.FAILED,
      ].includes(message.status)
    ) {
      return message;
    }

    // >>> OpenAI Message
    message.message.content = this.add(
      message.message.content,
      deltaMessage.content,
    );
    message.message.reasoning_content = this.add(
      message.message.reasoning_content,
      deltaMessage.reasoning_content,
    );
    if (deltaMessage.tool_calls && deltaMessage.tool_calls.length > 0) {
      message.message.tool_calls = deltaMessage.tool_calls;
    }
    if (deltaMessage.tool_call_id) {
      message.message.tool_call_id = deltaMessage.tool_call_id;
    }
    // <<< OpenAI Message
    message.status = MessageStatus.STREAMING;
    if (delta.attrs) {
      message.attrs = message.attrs || {};
      Object.assign(message.attrs, delta.attrs);
    }
    // attrs.usage is overwritten by the merge above, so the columns are what
    // add up to the whole call. Agent credits are billed off them at eos.
    const tokens = agentTokenDeltaOf(delta.attrs);
    if (tokens) {
      message.inputTokenCached += tokens.inputTokenCached;
      message.inputTokenUncached += tokens.inputTokenUncached;
      message.outputToken += tokens.outputToken;
    }
    return await this.messageRepository.save(message);
  }

  async findAll(userId: string | undefined, conversationId: string) {
    return await this.messageRepository.find({
      where: { conversationId, userId: userId ? userId : IsNull() },
      order: { createdAt: 'ASC' },
    });
  }

  async findOne(id: string) {
    return await this.messageRepository.findOneOrFail({
      where: { id },
    });
  }

  async findOneForUser(id: string, userId: string) {
    return await this.messageRepository.findOneOrFail({
      where: { id, userId },
    });
  }

  async stopRunning(
    namespaceId: string,
    conversationId: string,
    userId: string | undefined,
  ): Promise<Message | null> {
    const message = await this.messageRepository.findOne({
      where: {
        conversationId,
        userId: userId ? userId : IsNull(),
        status: In([
          MessageStatus.PENDING,
          MessageStatus.STREAMING,
          MessageStatus.INTERRUPTED,
        ]),
      },
      order: { createdAt: 'DESC' },
    });
    if (!message) return null;
    return await this.update(
      message.id,
      namespaceId,
      conversationId,
      { status: MessageStatus.STOPPED },
      true,
    );
  }

  async remove(conversationId: string, messageId: string, user: User) {
    return await this.messageRepository.softDelete({
      id: messageId,
      conversationId,
      userId: user.id,
    });
  }
}
