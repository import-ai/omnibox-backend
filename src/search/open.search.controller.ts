import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import {
  APIKey as APIKeyEntity,
  APIKeyPermissionTarget,
  APIKeyPermissionType,
} from 'omniboxd/api-key/api-key.entity';
import { APIKey, APIKeyAuth } from 'omniboxd/auth/decorators';
import { OpenSearchRequestDto } from 'omniboxd/search/dto/open-search-request.dto';
import { IndexedResourceDto } from 'omniboxd/search/dto/indexed-doc.dto';
import { SearchService } from 'omniboxd/search/search.service';

@ApiTags('Search')
@ApiSecurity('api-key')
@Controller('open/api/v1/search')
export class OpenSearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @APIKeyAuth({
    permissions: [
      {
        target: APIKeyPermissionTarget.SEARCH,
        permissions: [APIKeyPermissionType.READ],
      },
    ],
  })
  @ApiOperation({ summary: 'Search resources under the API key root' })
  @ApiResponse({
    status: 200,
    description: 'Resource search results retrieved successfully',
    type: [IndexedResourceDto],
  })
  @ApiResponse({ status: 401, description: 'Invalid or missing API key' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async search(
    @APIKey() apiKey: APIKeyEntity,
    @Query() query: OpenSearchRequestDto,
  ): Promise<IndexedResourceDto[]> {
    return await this.searchService.openSearch(apiKey, query.query, {
      offset: query.offset,
      limit: query.limit,
    });
  }
}
