import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationsModule } from 'omniboxd/conversations/conversations.module';
import { MessagesModule } from 'omniboxd/messages/messages.module';
import { NamespaceResourcesModule } from 'omniboxd/namespace-resources/namespace-resources.module';
import { PermissionsModule } from 'omniboxd/permissions/permissions.module';
import { ResourcesModule } from 'omniboxd/resources/resources.module';
import { OpenSearchService } from 'omniboxd/search/open.search.service';
import { TagModule } from 'omniboxd/tag/tag.module';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { TasksModule } from 'omniboxd/tasks/tasks.module';
import { WizardAPIModule } from 'omniboxd/wizard-api/wizard-api.module';

import {
  InternalSearchController,
  SearchController,
} from './search.controller';
import { SearchService } from './search.service';

@Module({
  exports: [SearchService, OpenSearchService],
  providers: [SearchService, OpenSearchService],
  controllers: [SearchController, InternalSearchController],
  imports: [
    WizardAPIModule,
    PermissionsModule,
    NamespaceResourcesModule,
    ResourcesModule,
    MessagesModule,
    ConversationsModule,
    TasksModule,
    TagModule,
    TypeOrmModule.forFeature([Task]),
  ],
})
export class SearchModule {}
