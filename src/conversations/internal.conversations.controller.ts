import { Controller, Get, Param } from '@nestjs/common';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';
import { HeaderUserId } from 'omniboxd/decorators/header-user-id.decorator';

import { ConversationsService } from './conversations.service';

@Controller('internal/api/v1/namespaces/:namespaceId/conversations')
export class InternalConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

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
