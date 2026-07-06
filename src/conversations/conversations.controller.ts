import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { UserId } from 'omniboxd/decorators/user-id.decorator';

import { ConversationsService } from './conversations.service';
import { ConversationDetailDto } from './dto/conversation-detail.dto';
import { ConversationSummaryDto } from './dto/conversation-summary.dto';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';

@Controller('api/v1/namespaces/:namespaceId/conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  async list(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('order') order?: string,
  ): Promise<{
    total: number;
    data: ConversationSummaryDto[];
  }> {
    return await this.conversationsService.listSummary(namespaceId, userId, {
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      order,
    });
  }

  @Post()
  async create(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Body() createConversationDto: CreateConversationDto,
  ) {
    return await this.conversationsService.create(
      namespaceId,
      userId,
      createConversationDto?.isRecommended ?? false,
    );
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateConversationDto: UpdateConversationDto,
  ) {
    await this.conversationsService.update(id, updateConversationDto.title);
  }

  @Get(':id')
  async get(
    @Param('id') id: string,
    @UserId() userId: string,
  ): Promise<ConversationDetailDto> {
    return await this.conversationsService.getConversationForUser(id, userId);
  }

  @Post(':id/title')
  async createTitle(@Param('id') id: string, @UserId() userId: string) {
    return await this.conversationsService.createTitle(id, userId);
  }

  @Delete(':id')
  async remove(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('id') conversationId: string,
  ) {
    return await this.conversationsService.remove(
      namespaceId,
      userId,
      conversationId,
    );
  }

  @Post(':id/restore')
  async restore(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('id') conversationId: string,
  ) {
    return await this.conversationsService.restore(
      namespaceId,
      userId,
      conversationId,
    );
  }
}
