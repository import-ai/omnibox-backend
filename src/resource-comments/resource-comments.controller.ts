import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { UserId } from 'omniboxd/decorators/user-id.decorator';

import {
  CreateResourceCommentRequestDto,
  CreateResourceCommentThreadRequestDto,
  ListResourceCommentThreadsRequestDto,
  UpdateResourceCommentRequestDto,
  UpdateResourceCommentThreadRequestDto,
} from './dto/resource-comment-request.dto';
import { ResourceCommentsService } from './resource-comments.service';

@Controller(
  'api/v1/namespaces/:namespaceId/resources/:resourceId/comment-threads',
)
export class ResourceCommentsController {
  constructor(
    private readonly resourceCommentsService: ResourceCommentsService,
  ) {}

  @Get()
  async listThreads(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @Query() query: ListResourceCommentThreadsRequestDto,
  ) {
    return await this.resourceCommentsService.listThreads(
      namespaceId,
      resourceId,
      userId,
      query,
    );
  }

  @Post()
  async createThread(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @Body() dto: CreateResourceCommentThreadRequestDto,
  ) {
    return await this.resourceCommentsService.createThread(
      namespaceId,
      resourceId,
      userId,
      dto,
    );
  }

  @Post(':threadId/comments')
  async createComment(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @Param('threadId') threadId: string,
    @Body() dto: CreateResourceCommentRequestDto,
  ) {
    return await this.resourceCommentsService.createComment(
      namespaceId,
      resourceId,
      threadId,
      userId,
      dto,
    );
  }

  @Patch(':threadId')
  async updateThread(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @Param('threadId') threadId: string,
    @Body() dto: UpdateResourceCommentThreadRequestDto,
  ) {
    return await this.resourceCommentsService.updateThread(
      namespaceId,
      resourceId,
      threadId,
      userId,
      dto,
    );
  }

  @Patch(':threadId/comments/:commentId')
  async updateComment(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @Param('threadId') threadId: string,
    @Param('commentId') commentId: string,
    @Body() dto: UpdateResourceCommentRequestDto,
  ) {
    return await this.resourceCommentsService.updateComment(
      namespaceId,
      resourceId,
      threadId,
      commentId,
      userId,
      dto,
    );
  }

  @Delete(':threadId')
  async deleteThread(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @Param('threadId') threadId: string,
  ): Promise<void> {
    await this.resourceCommentsService.deleteThread(
      namespaceId,
      resourceId,
      threadId,
      userId,
    );
  }

  @Delete(':threadId/comments/:commentId')
  async deleteComment(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @Param('threadId') threadId: string,
    @Param('commentId') commentId: string,
  ) {
    return await this.resourceCommentsService.deleteComment(
      namespaceId,
      resourceId,
      threadId,
      commentId,
      userId,
    );
  }
}
