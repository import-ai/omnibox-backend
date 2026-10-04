import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Expose } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';
import { HeaderUserId } from 'omniboxd/decorators/header-user-id.decorator';
import { UserId } from 'omniboxd/decorators/user-id.decorator';

import { DocType } from './doc-type.enum';
import { SearchRequestDto } from './dto/search-request.dto';
import { SearchService } from './search.service';

@Controller('api/v1/namespaces/:namespaceId/search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  async search(
    @UserId() userId,
    @Param('namespaceId') namespaceId: string,
    @Query('query') query: string,
    @Query('type') type?: DocType,
    @Headers('x-timezone') timeZone?: string,
  ) {
    return await this.searchService.search(userId, namespaceId, query, type, {
      timeZone,
    });
  }

  @Post()
  async searchWithFilters(
    @UserId() userId,
    @Param('namespaceId') namespaceId: string,
    @Body() data: SearchRequestDto,
    @Headers('x-timezone') timeZone?: string,
  ) {
    return await this.searchService.searchPaginated(
      userId,
      namespaceId,
      data.query || '',
      data.type,
      {
        conditions: data.conditions,
        matchMode: data.matchMode,
        timeZone,
      },
      {
        offset: data.offset,
        limit: data.limit,
      },
    );
  }
}

class RebuildMessageIndexRequestDto {
  @IsString()
  @IsNotEmpty()
  @Expose({ name: 'namespace_id' })
  namespaceId: string;
  @IsBoolean()
  @IsOptional()
  apply?: boolean;
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @Expose({ name: 'message_ids' })
  messageIds?: string[];
}

class RebuildAllMessageIndexesRequestDto {
  @IsBoolean()
  @IsOptional()
  apply?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ArrayNotEmpty()
  @IsNotEmpty({ each: true })
  @Expose({ name: 'namespace_ids' })
  namespaceIds?: string[];
}

@Controller('internal/api/v1')
export class InternalSearchController {
  constructor(private readonly searchService: SearchService) {}

  @Public()
  @Post('rebuild_message_index')
  async rebuildMessages(@Body() data: RebuildMessageIndexRequestDto) {
    return this.searchService.rebuildMessageIndex(
      data.namespaceId,
      data.apply === true,
      data.messageIds,
    );
  }

  @Public()
  @Post('rebuild_all_message_indexes')
  async rebuildAllMessages(@Body() data: RebuildAllMessageIndexesRequestDto) {
    return this.searchService.rebuildAllMessageIndexes(
      data.apply === true,
      data.namespaceIds,
    );
  }

  @Public()
  @Post('refresh_index')
  async refreshIndex() {
    await this.searchService.refreshResourceIndex();
    await this.searchService.refreshMessageIndex();
  }

  @Public()
  @Post('sync_weaviate')
  async syncWeaviate(
    @Query('concurrency')
    concurrency: number = 1,
    @Query('updatedAfter')
    updatedAfter?: Date,
  ) {
    const updatedAfterDate = updatedAfter ? new Date(updatedAfter) : undefined;
    return await this.searchService.syncWeaviateBackfill(
      concurrency,
      updatedAfterDate,
    );
  }
}

@Controller('internal/api/v1/namespaces/:namespaceId/search')
export class InternalNamespaceSearchController {
  constructor(private readonly searchService: SearchService) {}

  @Public()
  @Post()
  async searchMessages(
    @HeaderUserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Body() data: SearchRequestDto,
  ) {
    return this.searchService.searchMessages(
      userId,
      namespaceId,
      data.query || '',
      {
        offset: data.offset,
        limit: data.limit,
        excludeConversationId: data.excludeConversationId,
      },
    );
  }
}
