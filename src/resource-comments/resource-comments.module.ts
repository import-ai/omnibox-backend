import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NamespacesQuotaModule } from 'omniboxd/namespaces/namespaces-quota.module';
import { PermissionsModule } from 'omniboxd/permissions/permissions.module';
import { ResourcesModule } from 'omniboxd/resources/resources.module';
import { S3Module } from 'omniboxd/s3/s3.module';
import { User } from 'omniboxd/user/entities/user.entity';

import { ResourceComment } from './entities/resource-comment.entity';
import { ResourceCommentAttachment } from './entities/resource-comment-attachment.entity';
import { ResourceCommentThread } from './entities/resource-comment-thread.entity';
import { ResourceCommentAttachmentsController } from './resource-comment-attachments.controller';
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
    NamespacesQuotaModule,
  ],
  controllers: [
    ResourceCommentsController,
    ResourceCommentAttachmentsController,
  ],
  providers: [ResourceCommentsService],
  exports: [ResourceCommentsService],
})
export class ResourceCommentsModule {}
