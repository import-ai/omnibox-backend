import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation } from 'omniboxd/conversations/entities/conversation.entity';
import { Message } from 'omniboxd/messages/entities/message.entity';

import {
  ConversationSharesController,
  PublicConversationSharesController,
} from './conversation-shares.controller';
import { ConversationSharesService } from './conversation-shares.service';
import { ConversationShare } from './entities/conversation-share.entity';
import { ConversationShareEvent } from './entities/conversation-share-event.entity';
import { ConversationShareGroup } from './entities/conversation-share-group.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Conversation,
      Message,
      ConversationShare,
      ConversationShareGroup,
      ConversationShareEvent,
    ]),
  ],
  providers: [ConversationSharesService],
  controllers: [
    ConversationSharesController,
    PublicConversationSharesController,
  ],
  exports: [ConversationSharesService],
})
export class ConversationSharesModule {}
