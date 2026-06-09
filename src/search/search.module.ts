import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationsModule } from 'omniboxd/conversations/conversations.module';
import { MessagesModule } from 'omniboxd/messages/messages.module';
import { NamespaceResourcesModule } from 'omniboxd/namespace-resources/namespace-resources.module';
import { PermissionsModule } from 'omniboxd/permissions/permissions.module';
import { ResourcesModule } from 'omniboxd/resources/resources.module';
import { OpenSearchService } from 'omniboxd/search/open.search.service';
import { SmartFoldersModule } from 'omniboxd/smart-folders/smart-folders.module';
import { TagModule } from 'omniboxd/tag/tag.module';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { TasksModule } from 'omniboxd/tasks/tasks.module';
import { WizardAPIModule } from 'omniboxd/wizard-api/wizard-api.module';

import {
  InternalSearchController,
  SearchController,
} from './search.controller';
import { SearchService } from './search.service';
import { SearchCandidateService } from './search-candidate.service';
import { SearchResourceFilterService } from './search-resource-filter.service';

@Module({
  exports: [SearchService, OpenSearchService],
  providers: [
    SearchService,
    SearchResourceFilterService,
    SearchCandidateService,
    OpenSearchService,
  ],
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
    SmartFoldersModule,
    TypeOrmModule.forFeature([Task]),
  ],
})
export class SearchModule {}
