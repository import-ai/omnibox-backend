import { Module } from '@nestjs/common';
import { SearchService } from './search.service';
import {
  InternalSearchController,
  SearchController,
} from './search.controller';
import { PermissionsModule } from 'omniboxd/permissions/permissions.module';
import { NamespaceResourcesModule } from 'omniboxd/namespace-resources/namespace-resources.module';
import { MessagesModule } from 'omniboxd/messages/messages.module';
import { ConversationsModule } from 'omniboxd/conversations/conversations.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { TasksModule } from 'omniboxd/tasks/tasks.module';
import { ResourcesModule } from 'omniboxd/resources/resources.module';

@Module({
  exports: [SearchService],
  providers: [SearchService],
  controllers: [SearchController, InternalSearchController],
  imports: [
    PermissionsModule,
    NamespaceResourcesModule,
    ResourcesModule,
    MessagesModule,
    ConversationsModule,
    TasksModule,
    TypeOrmModule.forFeature([Task]),
  ],
})
export class SearchModule {}
