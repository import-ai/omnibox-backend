import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation } from 'src/conversations/entities/conversation.entity';
import { User } from 'src/user/user.entity';

@Injectable()
export class ConversationsService {
  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepository: Repository<Conversation>,
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
    user: User,
    options?: { limit?: number; offset?: number; order?: string },
  ) {
    const query: any = {
      where: { namespace: { id: namespaceId }, user: { id: user.id } },
      order: {
        updatedAt: options?.order?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC',
      },
    };
    if (options?.limit !== undefined) query.take = Number(options.limit);
    if (options?.offset !== undefined) query.skip = Number(options.offset);
    return await this.conversationRepository.find(query);
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
