import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ConversationsService } from './conversations.service';

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

  @Get(':id')
  async get(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('id') id: string,
  ) {
    return await this.conversationsService.findOne(namespaceId, id, req.user);
  }

  @Delete(':id')
  async remove(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('id') id: string,
  ) {
    return await this.conversationsService.remove(namespaceId, id, req.user);
  }
}
