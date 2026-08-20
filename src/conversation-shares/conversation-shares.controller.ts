import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Public } from 'omniboxd/auth/decorators';
import { UserId } from 'omniboxd/decorators/user-id.decorator';

import { ConversationSharesService } from './conversation-shares.service';
import { CreateConversationShareDto } from './dto/create-conversation-share.dto';

@Controller('api/v1/namespaces/:namespaceId/conversation-shares')
export class ConversationSharesController {
  constructor(
    private readonly conversationSharesService: ConversationSharesService,
  ) {}

  @Post()
  async create(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Body() request: CreateConversationShareDto,
  ) {
    return await this.conversationSharesService.create(
      namespaceId,
      userId,
      request,
    );
  }
}

@Public()
@Controller('api/v1/conversation-shares')
export class PublicConversationSharesController {
  constructor(
    private readonly conversationSharesService: ConversationSharesService,
  ) {}

  @Get(':shareId')
  async get(@Param('shareId') shareId: string) {
    return await this.conversationSharesService.getPublic(shareId);
  }
}
