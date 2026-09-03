import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionsModule } from 'omniboxd/permissions/permissions.module';
import { ResourcesModule } from 'omniboxd/resources/resources.module';
import { User } from 'omniboxd/user/entities/user.entity';

import { ResourceComment } from './entities/resource-comment.entity';
import { ResourceCommentThread } from './entities/resource-comment-thread.entity';
import { ResourceCommentsController } from './resource-comments.controller';
import { ResourceCommentsService } from './resource-comments.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ResourceCommentThread, ResourceComment, User]),
    PermissionsModule,
    ResourcesModule,
  ],
  controllers: [ResourceCommentsController],
  providers: [ResourceCommentsService],
  exports: [ResourceCommentsService],
})
export class ResourceCommentsModule {}
