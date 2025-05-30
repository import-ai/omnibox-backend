import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { MessagesService } from './messages.service';
import { CreateMessageDto } from './dto/create-message.dto';

@Controller(
  'api/v1/namespaces/:namespaceId/conversations/:conversationId/messages',
)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  async list(@Req() req, @Param('conversationId') conversationId: string) {
    return await this.messagesService.findAll(req.user.id, conversationId);
  }

  @Post()
  async create(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Param('conversationId') conversationId: string,
    @Body() dto: CreateMessageDto,
  ) {
    return await this.messagesService.create(
      namespaceId,
      conversationId,
      req.user,
      dto,
    );
  }

  @Delete(':messageId')
  async remove(
    @Req() req,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
  ) {
    return await this.messagesService.remove(
      conversationId,
      messageId,
      req.user,
    );
  }
}
