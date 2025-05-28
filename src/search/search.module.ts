import { Module } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { ConversationsModule } from 'src/conversations/conversations.module';

@Module({
  exports: [SearchService],
  providers: [SearchService],
  controllers: [SearchController],
  imports: [ConversationsModule],
})
export class SearchModule {}
