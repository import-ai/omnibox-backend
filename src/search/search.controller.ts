import { Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { SearchService } from './search.service';

@Controller('api/v1/namespaces/:namespaceId/search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  async search(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Query('query') query: string,
  ) {
    return await this.searchService.search(namespaceId, query);
  }
}
