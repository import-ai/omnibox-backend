import {
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Query,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import { Response } from 'express';
import { CookieAuth } from 'omniboxd/auth/decorators';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import {
  ValidatedShare,
  ValidateShare,
} from 'omniboxd/decorators/validate-share.decorator';
import { ValidateShareInterceptor } from 'omniboxd/interceptor/validate-share.interceptor';
import { ListResourceCommentThreadsRequestDto } from 'omniboxd/resource-comments/dto/resource-comment-request.dto';
import { ResourceCommentsService } from 'omniboxd/resource-comments/resource-comments.service';
import { Share } from 'omniboxd/shares/entities/share.entity';

import { toSharedCommentThreads } from './dto/shared-comment-threads';
import { SharedResourceDto } from './dto/shared-resource.dto';
import { SharedResourceMetaDto } from './dto/shared-resource-meta.dto';
import { SharedResourcesService } from './shared-resources.service';

@Controller('api/v1/shares/:shareId/resources')
@UseInterceptors(ValidateShareInterceptor)
export class SharedResourcesController {
  constructor(
    private readonly sharedResourcesService: SharedResourcesService,
    private readonly resourceCommentsService: ResourceCommentsService,
  ) {}

  @CookieAuth({ onAuthFail: 'continue' })
  @ValidateShare({ requireResources: true })
  @Get(':resourceId')
  async getResource(
    @Param('resourceId') resourceId: string,
    @ValidatedShare() share: Share,
    @Headers('x-timezone') timeZone?: string,
  ): Promise<SharedResourceDto> {
    return await this.sharedResourcesService.getSharedResource(
      share,
      resourceId,
      timeZone,
    );
  }

  @CookieAuth({ onAuthFail: 'continue' })
  @ValidateShare({ requireResources: true })
  @Get(':resourceId/comment-threads')
  async listComments(
    @ValidatedShare() share: Share,
    @Param('resourceId') resourceId: string,
    @Query() query: ListResourceCommentThreadsRequestDto,
    @UserId({ optional: true }) userId?: string,
  ) {
    await this.sharedResourcesService.getAndValidateResource(share, resourceId);
    const result = await this.resourceCommentsService.listThreads(
      share.namespaceId,
      resourceId,
      userId ?? '',
      query,
      false,
    );
    return {
      ...result,
      items: toSharedCommentThreads(result.items, share.id, resourceId),
    };
  }

  @CookieAuth({ onAuthFail: 'continue' })
  @ValidateShare({ requireResources: true })
  @Get(':resourceId/comment-attachments/:attachmentId')
  async downloadCommentAttachment(
    @ValidatedShare() share: Share,
    @Param('resourceId') resourceId: string,
    @Param('attachmentId') attachmentId: string,
    @Res() response: Response,
  ): Promise<void> {
    await this.sharedResourcesService.getAndValidateResource(share, resourceId);
    await this.resourceCommentsService.downloadSharedAttachment(
      share.namespaceId,
      resourceId,
      attachmentId,
      response,
    );
  }

  // Paged like the workspace children listing: a viewer must be able to read a
  // shared folder holding thousands of rss items a page at a time. The body
  // stays a plain array (the folder view shares one client for both listings);
  // the full count is reported in X-Total-Count.
  @CookieAuth({ onAuthFail: 'continue' })
  @ValidateShare({ requireResources: true })
  @Get(':resourceId/children')
  async getResourceChildren(
    @Param('resourceId') resourceId: string,
    @ValidatedShare() share: Share,
    @Res({ passthrough: true }) response: Response,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('offset', new ParseIntPipe({ optional: true })) offset?: number,
    @Headers('x-timezone') timeZone?: string,
  ): Promise<SharedResourceMetaDto[]> {
    const { resources, total } =
      await this.sharedResourcesService.getSharedResourceChildrenPage(
        share,
        resourceId,
        { limit, offset, timeZone },
      );
    response.setHeader('X-Total-Count', total.toString());
    return resources;
  }
}
