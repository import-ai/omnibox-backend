import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationAttachment } from 'omniboxd/attachments/entities/conversation-attachment.entity';
import { Conversation } from 'omniboxd/conversations/entities/conversation.entity';
import { Message } from 'omniboxd/messages/entities/message.entity';
import { PermissionsModule } from 'omniboxd/permissions/permissions.module';
import { ResourceAttachmentsModule } from 'omniboxd/resource-attachments/resource-attachments.module';
import { S3Module } from 'omniboxd/s3/s3.module';

import { ConversationShareImagesService } from './conversation-share-images.service';
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
    PermissionsModule,
    ResourceAttachmentsModule,
    S3Module,
    TypeOrmModule.forFeature([
      Conversation,
      Message,
      ConversationAttachment,
      ConversationShare,
      ConversationShareGroup,
      ConversationShareEvent,
    ]),
  ],
  providers: [ConversationShareImagesService, ConversationSharesService],
  controllers: [
    ConversationSharesController,
    PublicConversationSharesController,
  ],
  exports: [ConversationSharesService],
})
export class ConversationSharesModule {}
