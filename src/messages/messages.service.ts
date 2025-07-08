import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  Message,
  MessageStatus,
  OpenAIMessage,
} from 'src/messages/entities/message.entity';
import { CreateMessageDto } from 'src/messages/dto/create-message.dto';
import { User } from 'src/user/entities/user.entity';
import { ChatDeltaResponse } from '../wizard/dto/chat-response.dto';
import { Task } from 'src/tasks/tasks.entity';
import { WizardTask } from 'src/resources/wizard.task.service';

const TASK_PRIORITY = 5;

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
    private readonly dataSource: DataSource,
  ) {}

  async index(
    index: boolean,
    userId: string,
    namespaceId: string,
    conversationId: string,
    message: Message,
    manager: EntityManager,
  ) {
    if (index) {
      await WizardTask.index.upsertMessageIndex(
        TASK_PRIORITY,
        userId,
        namespaceId,
        conversationId,
        message,
        manager.getRepository(Task),
      );
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
      conversationId,
      userId: user.id,
      parentId: dto.parentId,
      attrs: dto.attrs,
    });
    return await this.dataSource.transaction(async (manager) => {
      const savedMsg = await manager.save(message);
      await this.index(
        index,
        user.id,
        namespaceId,
        conversationId,
        savedMsg,
        manager,
      );
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
    return await this.dataSource.transaction(async (manager) => {
      const updatedMsg = await manager.save(message);
      await this.index(
        index,
        message.userId,
        namespaceId,
        conversationId,
        message,
        manager,
      );
      return updatedMsg;
    });
  }

  add(source?: string, delta?: string): string | undefined {
    return delta ? (source || '') + delta : source;
  }

  async updateDelta(id: string, delta: ChatDeltaResponse) {
    const deltaMessage: Partial<OpenAIMessage> = delta.message;

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
    if (delta.attrs) {
      message.attrs = message.attrs || {};
      Object.assign(message.attrs, delta.attrs);
    }
    return await this.messageRepository.save(message);
  }

  async findAll(userId: string, conversationId: string) {
    return await this.messageRepository.find({
      where: { conversationId, userId },
      order: { createdAt: 'ASC' },
    });
  }

  async remove(conversationId: string, messageId: string, user: User) {
    return await this.messageRepository.softDelete({
      id: messageId,
      conversationId,
      userId: user.id,
    });
  }
}
