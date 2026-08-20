import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { Conversation } from 'omniboxd/conversations/entities/conversation.entity';
import {
  Message,
  MessageStatus,
  OpenAIMessageRole,
} from 'omniboxd/messages/entities/message.entity';
import { EntityManager, Repository } from 'typeorm';

import {
  ConversationShareResponseDto,
  PublicConversationShareDto,
} from './dto/conversation-share-response.dto';
import { CreateConversationShareDto } from './dto/create-conversation-share.dto';
import {
  ConversationShare,
  ConversationShareStatus,
} from './entities/conversation-share.entity';
import { ConversationShareEvent } from './entities/conversation-share-event.entity';
import { ConversationShareGroup } from './entities/conversation-share-group.entity';

interface ResolvedShareGroup {
  answer: Message;
  question: Message;
}

@Injectable()
export class ConversationSharesService {
  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    @InjectRepository(ConversationShare)
    private readonly shareRepo: Repository<ConversationShare>,
    @InjectRepository(ConversationShareGroup)
    private readonly groupRepo: Repository<ConversationShareGroup>,
    private readonly config: ConfigService,
  ) {}

  async create(
    namespaceId: string,
    userId: string,
    request: CreateConversationShareDto,
  ): Promise<ConversationShareResponseDto> {
    const conversation = await this.conversationRepo.findOne({
      where: { id: request.conversation_id, namespaceId, userId },
    });
    if (!conversation) {
      throw this.notFound();
    }

    const messages = await this.messageRepo.find({
      where: { conversationId: conversation.id, userId },
      order: { createdAt: 'ASC' },
    });
    this.ensureNotGenerating(messages);
    const selectedGroups = this.resolveSelectedGroups(
      messages,
      request.group_ids,
    );
    const title = this.resolveTitle(
      conversation.title,
      selectedGroups[0].question,
    );
    const summary = this.summarize(
      selectedGroups[0].answer.message.content ?? '',
    );

    const share = this.shareRepo.create({
      namespaceId,
      userId,
      sourceConversationId: conversation.id,
      title,
      summary,
      status: ConversationShareStatus.ACTIVE,
      invalidatedAt: null,
      groups: this.groupRepo.create(
        selectedGroups.map(({ question, answer }, ordinal) => ({
          ordinal,
          questionContent: question.message.content?.trim() ?? '',
          answerContent: answer.message.content?.trim() ?? '',
        })),
      ),
      events: [
        {
          channel: request.channel,
          result: 'created',
          failureCode: null,
        } as ConversationShareEvent,
      ],
    });
    const saved = await this.shareRepo.save(share);
    return this.toResponse(saved);
  }

  async getPublic(shareId: string): Promise<PublicConversationShareDto> {
    const share = await this.shareRepo.findOne({
      where: { id: shareId, status: ConversationShareStatus.ACTIVE },
      relations: { groups: true },
    });
    if (!share) {
      throw this.notFound();
    }

    return {
      id: share.id,
      title: share.title,
      summary: share.summary,
      groups: share.groups
        .sort((left, right) => left.ordinal - right.ordinal)
        .map((group) => ({
          question: group.questionContent,
          answer: group.answerContent,
        })),
    };
  }

  async invalidateBySourceConversation(
    sourceConversationId: string,
    manager?: EntityManager,
  ) {
    const repository =
      manager?.getRepository(ConversationShare) ?? this.shareRepo;
    await repository.update(
      { sourceConversationId, status: ConversationShareStatus.ACTIVE },
      { status: ConversationShareStatus.INVALID, invalidatedAt: new Date() },
    );
  }

  private resolveSelectedGroups(
    messages: Message[],
    groupIds: string[],
  ): ResolvedShareGroup[] {
    const selectedIds = new Set(groupIds);
    if (selectedIds.size === 0) {
      throw this.invalidRequest(
        'Select at least one complete conversation group.',
      );
    }

    const messagesById = new Map(
      messages.map((message) => [message.id, message]),
    );
    const groups = messages.flatMap((question) => {
      if (!this.isShareableQuestion(question)) return [];
      const answer = messages.find(
        (candidate) =>
          this.isFinalAnswer(candidate) &&
          this.hasAncestor(candidate, question.id, messagesById),
      );
      return answer ? [{ question, answer }] : [];
    });
    const selected = groups.filter(({ question }) =>
      selectedIds.has(question.id),
    );
    if (selected.length !== selectedIds.size) {
      throw this.invalidRequest(
        'Each selected group must contain a completed answer.',
      );
    }
    return selected;
  }

  private ensureNotGenerating(messages: Message[]) {
    if (
      messages.some(
        (message) =>
          message.status === MessageStatus.PENDING ||
          message.status === MessageStatus.STREAMING,
      )
    ) {
      throw new AppException(
        'Conversation content is still being generated.',
        'CONVERSATION_GENERATING',
        HttpStatus.CONFLICT,
      );
    }
  }

  private isShareableQuestion(message: Message) {
    const decisions = (
      message.attrs?.tool_call as { decisions?: unknown[] } | undefined
    )?.decisions;
    return (
      message.message.role === OpenAIMessageRole.USER &&
      !decisions?.length &&
      Boolean(message.message.content?.trim())
    );
  }

  private isFinalAnswer(message: Message) {
    return (
      message.message.role === OpenAIMessageRole.ASSISTANT &&
      (message.status === MessageStatus.SUCCESS ||
        message.status === MessageStatus.STOPPED) &&
      !message.message.tool_calls?.length &&
      Boolean(message.message.content?.trim())
    );
  }

  private hasAncestor(
    message: Message,
    ancestorId: string,
    messagesById: ReadonlyMap<string, Message>,
  ) {
    const visited = new Set<string>();
    let parentId = message.parentId;
    while (parentId && !visited.has(parentId)) {
      if (parentId === ancestorId) return true;
      visited.add(parentId);
      parentId = messagesById.get(parentId)?.parentId ?? null;
    }
    return false;
  }

  private toResponse(share: ConversationShare): ConversationShareResponseDto {
    return {
      id: share.id,
      url: `${this.baseUrl()}/?share_id=${encodeURIComponent(share.id)}`,
      title: share.title,
      summary: share.summary,
    };
  }

  private resolveTitle(title: string, firstQuestion: Message) {
    const normalizedTitle = title.trim();
    return (
      normalizedTitle || this.summarize(firstQuestion.message.content ?? '', 48)
    );
  }

  private summarize(content: string, maxLength = 180) {
    const text = content.replace(/\s+/g, ' ').trim();
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 1).trimEnd()}…`;
  }

  private baseUrl() {
    return this.config
      .get<string>(
        'OBB_CONVERSATION_SHARE_URL',
        'https://www.omnibox.pro/zh-cn/conversation-share',
      )
      .replace(/\/$/, '');
  }

  private invalidRequest(message: string) {
    return new AppException(
      message,
      'INVALID_CONVERSATION_SHARE',
      HttpStatus.BAD_REQUEST,
    );
  }

  private notFound() {
    return new AppException(
      'Conversation share not found.',
      'CONVERSATION_SHARE_NOT_FOUND',
      HttpStatus.NOT_FOUND,
    );
  }
}
