import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { SearchService } from './search.service';
import { DocType } from './doc-type.enum';
import { Public } from 'src/auth/decorators/public.decorator';

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
      namespaceId,
      query,
      type,
      req.user.id,
    );
  }
}

@Controller('internal/api/v1/namespaces/:namespaceId/search')
export class InternalSearchController {
  constructor(private readonly searchService: SearchService) {}

  @Public()
  @Get()
  async search(
    @Param('namespaceId') namespaceId: string,
    @Query('query') query: string,
    @Query('type') type?: DocType,
  ) {
    return await this.searchService.search(namespaceId, query, type);
  }
}
