import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AttachmentsController,
  ConversationAttachmentsController,
} from 'omniboxd/attachments/attachments.controller';
import { AttachmentsService } from 'omniboxd/attachments/attachments.service';
import { ConversationAttachment } from 'omniboxd/attachments/entities/conversation-attachment.entity';
import { ConversationAttachmentResource } from 'omniboxd/attachments/entities/conversation-attachment-resource.entity';
import { MessageAttachment } from 'omniboxd/attachments/entities/message-attachment.entity';
import { InternalAttachmentsController } from 'omniboxd/attachments/internal.attachments.controller';
import { InternalConversationAttachmentsController } from 'omniboxd/attachments/internal.attachments.controller';
import { InternalShareAttachmentsController } from 'omniboxd/attachments/internal.share-attachments.controller';
import { ShareAttachmentsController } from 'omniboxd/attachments/share-attachments.controller';
import { Conversation } from 'omniboxd/conversations/entities/conversation.entity';
import { NamespacesQuotaModule } from 'omniboxd/namespaces/namespaces-quota.module';
import { PermissionsModule } from 'omniboxd/permissions/permissions.module';
import { ResourceAttachmentsModule } from 'omniboxd/resource-attachments/resource-attachments.module';
import { S3Module } from 'omniboxd/s3/s3.module';
import { SharedResourcesModule } from 'omniboxd/shared-resources/shared-resources.module';
import { SharesModule } from 'omniboxd/shares/shares.module';

@Module({
  exports: [AttachmentsService],
  providers: [AttachmentsService],
  controllers: [
    AttachmentsController,
    ConversationAttachmentsController,
    InternalAttachmentsController,
    InternalConversationAttachmentsController,
    InternalShareAttachmentsController,
    ShareAttachmentsController,
  ],
  imports: [
    TypeOrmModule.forFeature([
      Conversation,
      ConversationAttachment,
      ConversationAttachmentResource,
      MessageAttachment,
    ]),
    PermissionsModule,
    S3Module,
    ResourceAttachmentsModule,
    SharesModule,
    SharedResourcesModule,
    NamespacesQuotaModule,
  ],
})
export class AttachmentsModule {}
