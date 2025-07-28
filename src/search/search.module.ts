import { Module } from '@nestjs/common';
import { SearchService } from './search.service';
import {
  InternalSearchController,
  SearchController,
} from './search.controller';
import { PermissionsModule } from 'omniboxd/permissions/permissions.module';
import { ResourcesModule } from 'omniboxd/resources/resources.module';
import { MessagesModule } from 'omniboxd/messages/messages.module';
import { ConversationsModule } from 'omniboxd/conversations/conversations.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Task } from 'omniboxd/tasks/tasks.entity';

@Module({
  exports: [SearchService],
  providers: [SearchService],
  controllers: [SearchController, InternalSearchController],
  imports: [
    PermissionsModule,
    ResourcesModule,
    MessagesModule,
    ConversationsModule,
    TypeOrmModule.forFeature([Task]),
  ],
})
export class SearchModule {}
