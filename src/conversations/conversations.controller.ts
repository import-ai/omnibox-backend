import { ConversationsService } from './conversations.service';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import {
  Get,
  Req,
  Param,
  Post,
  Body,
  Query,
  Patch,
  Delete,
  Controller,
} from '@nestjs/common';

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
  ) {
    return await this.conversationsService.findAll(namespaceId, req.user, {
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      order,
    });
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
  async get(@Param('id') id: string) {
    return await this.conversationsService.findOne(id);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return await this.conversationsService.remove(id);
  }
}
