import { Module } from '@nestjs/common';
import { SearchService } from './search.service';
import {
  InternalSearchController,
  SearchController,
} from './search.controller';
import { PermissionsModule } from 'src/permissions/permissions.module';
import { ResourcesModule } from 'src/resources/resources.module';
import { MessagesModule } from 'src/messages/messages.module';
import { ConversationsModule } from 'src/conversations/conversations.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Task } from 'src/tasks/tasks.entity';

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
