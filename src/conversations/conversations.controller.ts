import { ConversationsService } from './conversations.service';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { ConversationDetailDto } from './dto/conversation-detail.dto';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ConversationSummaryDto } from './dto/conversation-summary.dto';

@Controller('api/v1/namespaces/:namespaceId/conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  async list(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('order') order?: string,
  ): Promise<{
    total: number;
    data: ConversationSummaryDto[];
  }> {
    return await this.conversationsService.listSummary(
      namespaceId,
      req.user.id,
      {
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
        order,
      },
    );
  }

  @Post()
  async create(@Req() req, @Param('namespaceId') namespaceId: string) {
    return await this.conversationsService.create(namespaceId, req.user);
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
    @Req() req,
  ): Promise<ConversationDetailDto> {
    return await this.conversationsService.getDetail(id, req.user);
  }

  @Post(':id/title')
  async createTitle(@Param('id') id: string, @Req() req) {
    return await this.conversationsService.createTitle(id, req.user.id);
  }

  @Delete(':id')
  async remove(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('id') conversationId: string,
  ) {
    return await this.conversationsService.remove(
      namespaceId,
      req.user.id,
      conversationId,
    );
  }

  @Post(':id/restore')
  async restore(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('id') conversationId: string,
  ) {
    return await this.conversationsService.restore(
      namespaceId,
      req.user.id,
      conversationId,
    );
  }
}
