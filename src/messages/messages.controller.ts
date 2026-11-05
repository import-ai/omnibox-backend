import {
  Controller,
  Delete,
  Param,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import { ChatClientCompatibilityInterceptor } from 'omniboxd/interceptor/chat-client-compatibility.interceptor';
import { MessagesService } from 'omniboxd/messages/messages.service';

@Controller(
  'api/v1/namespaces/:namespaceId/conversations/:conversationId/messages',
)
@UseInterceptors(ChatClientCompatibilityInterceptor)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

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
