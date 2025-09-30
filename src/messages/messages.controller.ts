import { Body, Controller, Delete, Param, Post, Req } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { UserId } from 'omniboxd/decorators/user-id.decorator';

@Controller(
  'api/v1/namespaces/:namespaceId/conversations/:conversationId/messages',
)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post()
  async create(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('conversationId') conversationId: string,
    @Body() dto: CreateMessageDto,
  ) {
    return await this.messagesService.create(
      namespaceId,
      conversationId,
      userId,
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
