import { Module } from '@nestjs/common';
import { SearchService } from './search.service';
import {
  InternalSearchController,
  SearchController,
} from './search.controller';
import { PermissionsModule } from 'omnibox-backend/permissions/permissions.module';
import { ResourcesModule } from 'omnibox-backend/resources/resources.module';
import { MessagesModule } from 'omnibox-backend/messages/messages.module';
import { ConversationsModule } from 'omnibox-backend/conversations/conversations.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Task } from 'omnibox-backend/tasks/tasks.entity';
import { UserModule } from 'omnibox-backend/user/user.module';

@Module({
  exports: [SearchService],
  providers: [SearchService],
  controllers: [SearchController, InternalSearchController],
  imports: [
    UserModule,
    PermissionsModule,
    ResourcesModule,
    MessagesModule,
    ConversationsModule,
    TypeOrmModule.forFeature([Task]),
  ],
})
export class SearchModule {}
