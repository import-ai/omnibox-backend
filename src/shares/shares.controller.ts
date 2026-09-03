import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { CookieAuth } from 'omniboxd/auth/decorators';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import {
  ValidatedShare,
  ValidateShare,
} from 'omniboxd/decorators/validate-share.decorator';
import { ValidateShareInterceptor } from 'omniboxd/interceptor/validate-share.interceptor';
import {
  CreateResourceCommentRequestDto,
  CreateResourceCommentThreadRequestDto,
  ListResourceCommentThreadsRequestDto,
  UpdateResourceCommentRequestDto,
  UpdateResourceCommentThreadRequestDto,
} from 'omniboxd/resource-comments/dto/resource-comment-request.dto';
import { ResourceCommentsService } from 'omniboxd/resource-comments/resource-comments.service';
import { Share } from 'omniboxd/shares/entities/share.entity';

import { UpdateShareInfoReqDto } from './dto/update-share-info-req.dto';
import { SharesService } from './shares.service';

@Controller('api/v1/namespaces/:namespaceId/resources/:resourceId/share')
export class ResourceSharesController {
  constructor(private readonly sharesService: SharesService) {}

  @Get()
  async getShareInfo(
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
  ) {
    return await this.sharesService.getShareInfo(namespaceId, resourceId);
  }

  @Patch()
  async updateShareInfo(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @Body() updateReq: UpdateShareInfoReqDto,
  ) {
    return await this.sharesService.updateShareInfo(
      userId,
      namespaceId,
      resourceId,
      updateReq,
    );
  }
}

@Controller('api/v1/shares/:shareId')
@UseInterceptors(ValidateShareInterceptor)
export class PublicSharesController {
  constructor(
    private readonly sharesService: SharesService,
    private readonly resourceCommentsService: ResourceCommentsService,
  ) {}

  @CookieAuth({ onAuthFail: 'continue' })
  @ValidateShare()
  @Get()
  async getShareInfo(@ValidatedShare() share: Share) {
    return await this.sharesService.getPublicShareInfo(share);
  }

  @CookieAuth()
  @ValidateShare({ requireResources: true })
  @Get('resources/:resourceId/comment-threads')
  async listComments(
    @ValidatedShare() share: Share,
    @UserId() userId: string,
    @Param('resourceId') resourceId: string,
    @Query() query: ListResourceCommentThreadsRequestDto,
  ) {
    return await this.resourceCommentsService.listThreads(
      share.namespaceId,
      resourceId,
      userId,
      query,
      false,
    );
  }

  @CookieAuth()
  @ValidateShare({ requireResources: true })
  @Post('resources/:resourceId/comment-threads')
  async createCommentThread(
    @ValidatedShare() share: Share,
    @UserId() userId: string,
    @Param('resourceId') resourceId: string,
    @Body() dto: CreateResourceCommentThreadRequestDto,
  ) {
    return await this.resourceCommentsService.createThread(
      share.namespaceId,
      resourceId,
      userId,
      dto,
      false,
    );
  }

  @CookieAuth()
  @ValidateShare({ requireResources: true })
  @Post('resources/:resourceId/comment-threads/:threadId/comments')
  async createComment(
    @ValidatedShare() share: Share,
    @UserId() userId: string,
    @Param('resourceId') resourceId: string,
    @Param('threadId') threadId: string,
    @Body() dto: CreateResourceCommentRequestDto,
  ) {
    return await this.resourceCommentsService.createComment(
      share.namespaceId,
      resourceId,
      threadId,
      userId,
      dto,
      false,
    );
  }

  @CookieAuth()
  @ValidateShare({ requireResources: true })
  @Patch('resources/:resourceId/comment-threads/:threadId')
  async updateCommentThread(
    @ValidatedShare() share: Share,
    @UserId() userId: string,
    @Param('resourceId') resourceId: string,
    @Param('threadId') threadId: string,
    @Body() dto: UpdateResourceCommentThreadRequestDto,
  ) {
    return await this.resourceCommentsService.updateThread(
      share.namespaceId,
      resourceId,
      threadId,
      userId,
      dto,
    );
  }

  @CookieAuth()
  @ValidateShare({ requireResources: true })
  @Patch('resources/:resourceId/comment-threads/:threadId/comments/:commentId')
  async updateComment(
    @ValidatedShare() share: Share,
    @UserId() userId: string,
    @Param('resourceId') resourceId: string,
    @Param('threadId') threadId: string,
    @Param('commentId') commentId: string,
    @Body() dto: UpdateResourceCommentRequestDto,
  ) {
    return await this.resourceCommentsService.updateComment(
      share.namespaceId,
      resourceId,
      threadId,
      commentId,
      userId,
      dto,
      false,
    );
  }

  @CookieAuth()
  @ValidateShare({ requireResources: true })
  @Delete('resources/:resourceId/comment-threads/:threadId')
  async deleteCommentThread(
    @ValidatedShare() share: Share,
    @UserId() userId: string,
    @Param('resourceId') resourceId: string,
    @Param('threadId') threadId: string,
  ): Promise<void> {
    await this.resourceCommentsService.deleteThread(
      share.namespaceId,
      resourceId,
      threadId,
      userId,
    );
  }

  @CookieAuth()
  @ValidateShare({ requireResources: true })
  @Delete('resources/:resourceId/comment-threads/:threadId/comments/:commentId')
  async deleteComment(
    @ValidatedShare() share: Share,
    @UserId() userId: string,
    @Param('resourceId') resourceId: string,
    @Param('threadId') threadId: string,
    @Param('commentId') commentId: string,
  ) {
    return await this.resourceCommentsService.deleteComment(
      share.namespaceId,
      resourceId,
      threadId,
      commentId,
      userId,
    );
  }
}
