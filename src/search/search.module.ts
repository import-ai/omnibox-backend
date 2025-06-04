import { Module } from '@nestjs/common';
import { SearchService } from './search.service';
import {
  InternalSearchController,
  SearchController,
} from './search.controller';
import { PermissionsModule } from 'src/permissions/permissions.module';

@Module({
  exports: [SearchService],
  providers: [SearchService],
  controllers: [SearchController, InternalSearchController],
  imports: [PermissionsModule],
})
export class SearchModule {}
