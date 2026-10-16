import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';
import { HeaderUserId } from 'omniboxd/decorators/header-user-id.decorator';

import { ListResourceCommentThreadsRequestDto } from './dto/resource-comment-request.dto';
import { ResourceCommentQueriesService } from './resource-comment-queries.service';

@Controller('internal/api/v1')
export class InternalResourceCommentsController {
  constructor(
    private readonly resourceCommentQueriesService: ResourceCommentQueriesService,
  ) {}

  @Public()
  @Get('namespaces/:namespaceId/resources/:resourceId/comment-threads')
  async listThreads(
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @HeaderUserId() userId: string,
    @Query() query: ListResourceCommentThreadsRequestDto,
  ) {
    return await this.resourceCommentQueriesService.listThreads(
      namespaceId,
      resourceId,
      userId,
      query,
    );
  }
}
