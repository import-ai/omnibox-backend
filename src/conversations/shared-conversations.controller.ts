import { Controller, Post, UseInterceptors } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { CookieAuth } from 'omniboxd/auth/decorators';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import {
  ValidateShare,
  ValidatedShare,
} from 'omniboxd/decorators/validate-share.decorator';
import { ValidateShareInterceptor } from 'omniboxd/interceptor/validate-share.interceptor';
import { Share } from 'omniboxd/shares/entities/share.entity';

@Controller('api/v1/shares/:shareId/conversations')
@UseInterceptors(ValidateShareInterceptor)
export class SharedConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @CookieAuth({ onAuthFail: 'continue' })
  @ValidateShare()
  @Post()
  async createConversationForShare(@ValidatedShare() share: Share) {
    return await this.conversationsService.createConversationForShare(share);
  }
}
