import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { SearchService } from './search.service';
import { DocType } from './doc-type.enum';

@Controller('api/v1/namespaces/:namespaceId/search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  async search(
    @Req() req,
    @Param('namespaceId') namespaceId: string,
    @Query('query') query: string,
    @Query('type') type?: DocType,
  ) {
    return await this.searchService.search(
      req.user.id,
      namespaceId,
      query,
      type,
    );
  }
}
