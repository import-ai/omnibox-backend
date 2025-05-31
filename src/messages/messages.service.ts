import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Message,
  MessageStatus,
  OpenAIMessage,
} from 'src/messages/entities/message.entity';
import { CreateMessageDto } from 'src/messages/dto/create-message.dto';
import { User } from 'src/user/user.entity';
import { SearchService } from 'src/search/search.service';

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
    private readonly searchService: SearchService,
  ) {}

  index(index: boolean, namespaceId: string, message: Message) {
    if (index) {
      this.searchService.addMessage(namespaceId, message).catch((err) => {
        console.error('Failed to index message:', err);
      });
    }
  }

  async create(
    namespaceId: string,
    conversationId: string,
    user: User,
    dto: CreateMessageDto,
    index: boolean = true,
  ): Promise<Message> {
    const message = this.messageRepository.create({
      message: dto.message,
      conversation: { id: conversationId },
      user: { id: user.id },
      parentId: dto.parentId,
      attrs: dto.attrs,
    });
    const savedMsg = await this.messageRepository.save(message);
    this.index(index, namespaceId, savedMsg);
    return savedMsg;
  }

  async update(
    id: string,
    namespaceId: string,
    dto: Partial<CreateMessageDto>,
    index: boolean = true,
  ): Promise<Message> {
    const condition: Record<string, any> = { where: { id } };
    if (index) {
      condition.relations = ['user'];
    }
    const message = await this.messageRepository.findOneOrFail(condition);
    Object.assign(message, dto);
    const updatedMsg = await this.messageRepository.save(message);
    this.index(index, namespaceId, message);
    return updatedMsg;
  }

  add(source?: string, delta?: string): string | undefined {
    return delta ? (source || '') + delta : source;
  }

  async updateOpenAIMessage(
    id: string,
    deltaMessage: Partial<OpenAIMessage>,
    attrs?: Record<string, any>,
  ) {
    const message = await this.messageRepository.findOneOrFail({
      where: { id },
    });

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
    if (attrs) {
      message.attrs = message.attrs || {};
      Object.assign(message.attrs, attrs);
    }
    return await this.messageRepository.save(message);
  }

  async findAll(userId: string, conversationId: string) {
    return await this.messageRepository.find({
      where: { conversation: { id: conversationId }, user: { id: userId } },
      order: { createdAt: 'ASC' },
    });
  }

  async remove(conversationId: string, messageId: string, user: User) {
    return await this.messageRepository.softDelete({
      id: messageId,
      conversation: { id: conversationId },
      user: { id: user.id },
    });
  }
}
