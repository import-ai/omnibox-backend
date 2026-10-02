import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';
import { HeaderUserId } from 'omniboxd/decorators/header-user-id.decorator';
import { isMessageIndexable } from 'omniboxd/messages/entities/message.entity';
import { MessagesService } from 'omniboxd/messages/messages.service';

import { ConversationsService } from './conversations.service';

@Controller('internal/api/v1/namespaces/:namespaceId/conversations')
export class InternalConversationsController {
  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly messagesService: MessagesService,
  ) {}

  @Public()
  @Get(':id/messages/:messageId')
  async readMessage(
    @Param('namespaceId') namespaceId: string,
    @Param('id') conversationId: string,
    @Param('messageId') messageId: string,
    @HeaderUserId() userId: string,
    @Query('offset') rawOffset?: string,
    @Query('limit') rawLimit?: string,
    @Query('for_index') forIndex?: string,
  ) {
    await this.conversationsService.findOneForUserInNamespace(
      conversationId,
      userId,
      namespaceId,
    );
    const message = await this.messagesService.findOne(messageId);
    if (message.conversationId !== conversationId || message.userId !== userId)
      throw new NotFoundException();
    if (forIndex === 'true')
      return {
        indexable: isMessageIndexable(message),
        message: message.message,
      };
    if (!isMessageIndexable(message)) throw new NotFoundException();
    const offset = Math.max(0, Number.parseInt(rawOffset || '0', 10) || 0);
    const limit = Math.max(
      1,
      Math.min(8000, Number.parseInt(rawLimit || '4000', 10) || 4000),
    );
    const content = Array.from(message.message.content || '');
    return {
      message_id: messageId,
      conversation_id: conversationId,
      role: message.message.role,
      content: content.slice(offset, offset + limit).join(''),
      offset,
      next_offset: offset + limit < content.length ? offset + limit : null,
      total: content.length,
      created_at: message.createdAt,
    };
  }

  @Public()
  @Get(':id')
  async get(
    @Param('namespaceId') namespaceId: string,
    @Param('id') conversationId: string,
    @HeaderUserId() userId: string,
  ) {
    return await this.conversationsService.getConversationForUser(
      namespaceId,
      conversationId,
      userId,
    );
  }
}
