import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message } from 'src/messages/entities/message.entity';
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

  async create(
    namespaceId: string,
    conversationId: string,
    user: User,
    dto: CreateMessageDto,
  ) {
    const message = this.messageRepository.create({
      message: dto.message,
      conversation: { id: conversationId },
      user: { id: user.id },
      parentId: dto.parentId,
      attrs: dto.attrs,
    });
    const savedMsg = await this.messageRepository.save(message);
    this.searchService.addMessage(namespaceId, savedMsg).catch((err) => {
      console.error('Failed to index message:', err);
    });
    return savedMsg;
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
