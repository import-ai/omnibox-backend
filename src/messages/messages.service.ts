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
import { ChatDeltaResponse } from '../wizard/dto/chat-response.dto';
import { Task } from 'src/tasks/tasks.entity';
import { WizardTask } from 'src/resources/wizard.task.service';

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,

    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
  ) {}

  index(
    index: boolean,
    namespaceId: string,
    conversationId: string,
    message: Message,
  ) {
    if (index) {
      WizardTask.index
        .upsertMessage(
          namespaceId,
          conversationId,
          message,
          this.taskRepository,
        )
        .catch((err) => {
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
    this.index(index, namespaceId, conversationId, savedMsg);
    return savedMsg;
  }

  async update(
    id: string,
    namespaceId: string,
    conversationId: string,
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
    this.index(index, namespaceId, conversationId, message);
    return updatedMsg;
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
