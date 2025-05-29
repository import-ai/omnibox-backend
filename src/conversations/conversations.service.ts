import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation } from 'src/conversations/entities/conversation.entity';
import { User } from 'src/user/user.entity';
import { MessagesService } from 'src/messages/messages.service';
import {
  ConversationDetailDto,
  ConversationMessageMappingDto,
} from 'src/conversations/dto/conversation-detail.dto';
import { ConversationSummaryDto } from './dto/conversation-summary.dto';
import {
  Message,
  OpenAIMessageRole,
} from 'src/messages/entities/message.entity';

@Injectable()
export class ConversationsService {
  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepository: Repository<Conversation>,
    private readonly messagesService: MessagesService,
  ) {}

  async create(namespaceId: string, user: User) {
    const conversation = this.conversationRepository.create({
      namespace: { id: namespaceId },
      user: { id: user.id },
    });
    return await this.conversationRepository.save(conversation);
  }

  async update(id: string, title: string) {
    const conversation = await this.findOne(id);
    conversation.title = title;
    await this.conversationRepository.save(conversation);
  }

  async findAll(
    namespaceId: string,
    userId: string,
    options?: { limit?: number; offset?: number; order?: string },
  ) {
    const query: any = {
      where: { namespace: { id: namespaceId }, user: { id: userId } },
      order: {
        updatedAt: options?.order?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC',
      },
    };
    if (options?.limit !== undefined) query.take = Number(options.limit);
    if (options?.offset !== undefined) query.skip = Number(options.offset);
    return await this.conversationRepository.find(query);
  }

  async compose(
    userId: string,
    conversationId: string,
    lastMessageId?: string,
  ) {
    const messages: Message[] = await this.messagesService.findAll(
      userId,
      conversationId,
    );
    if (messages.length === 0) {
      return [];
    }
    if (lastMessageId === undefined) {
      const lastMessage = messages[messages.length - 1];
      lastMessageId = lastMessage.id;
    }
    const composed: Message[] = [];
    while (lastMessageId) {
      const message = messages.find((message) => message.id === lastMessageId);
      if (message === undefined) {
        throw new Error('message not found');
      }
      composed.unshift(message);
      lastMessageId = message.parentId;
    }
    return composed;
  }

  async getFirstContent(
    userId: string,
    conversationId: string,
    targetRole: OpenAIMessageRole = OpenAIMessageRole.ASSISTANT,
  ): Promise<string | undefined> {
    const messages: Message[] = await this.compose(userId, conversationId);
    for (const m of messages) {
      if (m.message.role === targetRole && m.message.content) {
        return m.message.content;
      }
    }
    return undefined;
  }

  async listSummary(
    namespaceId: string,
    userId: string,
    options?: { limit?: number; offset?: number; order?: string },
  ): Promise<ConversationSummaryDto[]> {
    const conversations = await this.findAll(namespaceId, userId, options);
    const summaries: ConversationSummaryDto[] = [];
    for (const c of conversations) {
      summaries.push({
        id: c.id,
        title:
          c.title ||
          (await this.getFirstContent(userId, c.id, OpenAIMessageRole.USER)),
        created_at: c.createdAt.toISOString(),
        updated_at: c.updatedAt?.toISOString(),
        snippet: await this.getFirstContent(
          userId,
          c.id,
          OpenAIMessageRole.ASSISTANT,
        ),
      } as ConversationSummaryDto);
    }
    return summaries;
  }

  async getDetail(id: string, user: User): Promise<ConversationDetailDto> {
    const conversation = await this.conversationRepository.findOneOrFail({
      where: { id, user: { id: user.id } },
    });
    const messages = await this.messagesService.findAll(
      user.id,
      conversation.id,
    );
    const mapping: Record<string, ConversationMessageMappingDto> = {};
    const childrenMap: Record<string, string[]> = {};
    let currentNode: string | undefined = undefined;
    for (const msg of messages) {
      if (msg.parentId) {
        if (!childrenMap[msg.parentId]) {
          childrenMap[msg.parentId] = [];
        }
        childrenMap[msg.parentId].push(msg.id);
      }
    }
    for (const msg of messages) {
      mapping[msg.id] = {
        id: msg.id,
        message: msg.message,
        parent: msg.parentId,
        children: childrenMap[msg.id] || [],
        created_at: msg.createdAt.toISOString(),
        status: msg.status,
        attrs: msg.attrs,
      } as ConversationMessageMappingDto;
    }
    if (messages.length > 0) {
      currentNode = messages[messages.length - 1].id;
    }
    return {
      id: conversation.id,
      title: conversation.title,
      created_at: conversation.createdAt.toISOString(),
      updated_at: conversation.updatedAt?.toISOString(),
      mapping: mapping,
      current_node: currentNode,
    } as ConversationDetailDto;
  }

  async findOne(id: string) {
    return await this.conversationRepository.findOneOrFail({
      where: { id },
    });
  }

  async remove(id: string) {
    return await this.conversationRepository.softDelete(id);
  }
}
