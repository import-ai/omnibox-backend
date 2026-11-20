import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
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
import { OpenResourcesService } from 'omniboxd/namespace-resources/open-resources.service';

import {
  OpenCommentPageRequestDto,
  OpenListCommentThreadsRequestDto,
} from './dto/open-resource-comment-request.dto';
import {
  OpenListCommentsResponseDto,
  OpenListCommentThreadsResponseDto,
} from './dto/open-resource-comment-response.dto';
import { ResourceCommentOpenQueriesService } from './resource-comment-open-queries.service';

@ApiTags('Resource Comments')
@ApiSecurity('api-key')
@Controller('open/api/v1/resources/:resourceId/comment-threads')
export class OpenResourceCommentsController {
  constructor(
    private readonly openResourcesService: OpenResourcesService,
    private readonly commentQueries: ResourceCommentOpenQueriesService,
  ) {}

  @Get()
  @APIKeyAuth({
    permissions: [
      {
        target: APIKeyPermissionTarget.RESOURCES,
        permissions: [APIKeyPermissionType.READ],
      },
    ],
  })
  @ApiOperation({
    summary: 'List resource comment threads',
    description:
      'Returns document and inline threads with one surviving comment preview each. Use the comments endpoint to read further messages. Requires resources:read and current resource access.',
  })
  @ApiResponse({ status: 200, type: OpenListCommentThreadsResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid query parameters' })
  @ApiResponse({ status: 401, description: 'Invalid or missing API key' })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permission or resource outside key scope',
  })
  @ApiResponse({ status: 404, description: 'Resource not found' })
  @ApiResponse({ status: 429, description: 'Open API quota exhausted' })
  async listThreads(
    @APIKey() apiKey: APIKeyEntity,
    @Param('resourceId') resourceId: string,
    @Query() query: OpenListCommentThreadsRequestDto,
  ): Promise<OpenListCommentThreadsResponseDto> {
    const authorizedResourceId =
      await this.openResourcesService.resolveResourceId(
        apiKey.namespaceId,
        apiKey.resourceScope ?? apiKey.attrs.root_resource_id,
        resourceId,
        apiKey.userId,
      );
    return this.commentQueries.listThreads(
      apiKey.namespaceId,
      authorizedResourceId,
      apiKey.userId,
      query,
    );
  }

  @Get(':threadId/comments')
  @APIKeyAuth({
    permissions: [
      {
        target: APIKeyPermissionTarget.RESOURCES,
        permissions: [APIKeyPermissionType.READ],
      },
    ],
  })
  @ApiOperation({
    summary: 'List comments in a resource thread',
    description:
      'Reads surviving comments in creation order, including replies. The thread must belong to the authorized resource. Use offset=1 to continue after a thread preview.',
  })
  @ApiResponse({ status: 200, type: OpenListCommentsResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Invalid pagination or thread UUID',
  })
  @ApiResponse({ status: 401, description: 'Invalid or missing API key' })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permission or resource outside key scope',
  })
  @ApiResponse({ status: 404, description: 'Resource or thread not found' })
  @ApiResponse({ status: 429, description: 'Open API quota exhausted' })
  async listComments(
    @APIKey() apiKey: APIKeyEntity,
    @Param('resourceId') resourceId: string,
    @Param('threadId', new ParseUUIDPipe()) threadId: string,
    @Query() query: OpenCommentPageRequestDto,
  ): Promise<OpenListCommentsResponseDto> {
    const authorizedResourceId =
      await this.openResourcesService.resolveResourceId(
        apiKey.namespaceId,
        apiKey.resourceScope ?? apiKey.attrs.root_resource_id,
        resourceId,
        apiKey.userId,
      );
    return this.commentQueries.listComments(
      apiKey.namespaceId,
      authorizedResourceId,
      threadId,
      apiKey.userId,
      query,
    );
  }
}
