import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { SearchService } from './search.service';
import { DocType } from './doc-type.enum';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';

@Controller('api/v1/namespaces/:namespaceId/search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  async search(
    @UserId() userId,
    @Param('namespaceId') namespaceId: string,
    @Query('query') query: string,
    @Query('type') type?: DocType,
  ) {
    return await this.searchService.search(namespaceId, query, type, userId);
  }
}

@Controller('internal/api/v1')
export class InternalSearchController {
  constructor(private readonly searchService: SearchService) {}

  @Public()
  @Post('refresh_index')
  async refreshIndex() {
    await this.searchService.refreshResourceIndex();
    await this.searchService.refreshMessageIndex();
  }
}
