import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NamespacesQuotaModule } from 'omniboxd/namespaces/namespaces-quota.module';
import { PermissionsModule } from 'omniboxd/permissions/permissions.module';
import { ResourcesModule } from 'omniboxd/resources/resources.module';
import { S3Module } from 'omniboxd/s3/s3.module';
import { StorageUsagesModule } from 'omniboxd/storage-usages/storage-usages.module';
import { User } from 'omniboxd/user/entities/user.entity';

import { CommentAttachmentCleanupService } from './comment-attachment-cleanup.service';
import { ResourceComment } from './entities/resource-comment.entity';
import { ResourceCommentAttachment } from './entities/resource-comment-attachment.entity';
import { ResourceCommentThread } from './entities/resource-comment-thread.entity';
import { ResourceCommentAnchorsService } from './resource-comment-anchors.service';
import { ResourceCommentAttachmentsController } from './resource-comment-attachments.controller';
import { ResourceCommentAttachmentsService } from './resource-comment-attachments.service';
import { ResourceCommentQueriesService } from './resource-comment-queries.service';
import { ResourceCommentsController } from './resource-comments.controller';
import { ResourceCommentsService } from './resource-comments.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ResourceCommentThread,
      ResourceComment,
      ResourceCommentAttachment,
      User,
    ]),
    PermissionsModule,
    ResourcesModule,
    S3Module,
    StorageUsagesModule,
    NamespacesQuotaModule,
  ],
  controllers: [
    ResourceCommentsController,
    ResourceCommentAttachmentsController,
  ],
  providers: [
    ResourceCommentsService,
    ResourceCommentQueriesService,
    ResourceCommentAnchorsService,
    ResourceCommentAttachmentsService,
    CommentAttachmentCleanupService,
  ],
  exports: [
    ResourceCommentQueriesService,
    ResourceCommentsService,
    ResourceCommentAttachmentsService,
    ResourceCommentAnchorsService,
  ],
})
export class ResourceCommentsModule {}
