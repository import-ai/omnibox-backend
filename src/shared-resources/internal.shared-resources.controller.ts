import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { Public } from 'omniboxd/auth';
import {
  ValidatedShare,
  ValidateShare,
} from 'omniboxd/decorators/validate-share.decorator';
import { ValidateShareInterceptor } from 'omniboxd/interceptor/validate-share.interceptor';
import { ListResourceCommentThreadsRequestDto } from 'omniboxd/resource-comments/dto/resource-comment-request.dto';
import { ResourceCommentQueriesService } from 'omniboxd/resource-comments/resource-comment-queries.service';
import { ResourceFilterRequestDto } from 'omniboxd/resources/dto/resource-filter.request.dto';
import { Share } from 'omniboxd/shares/entities/share.entity';

import { toSharedCommentThreads } from './dto/shared-comment-threads';
import { SharedResourceDto } from './dto/shared-resource.dto';
import { SharedResourcesService } from './shared-resources.service';

@Controller('internal/api/v1/shares/:shareId/resources')
@UseInterceptors(ValidateShareInterceptor)
export class InternalSharedResourcesController {
  constructor(
    private readonly sharedResourcesService: SharedResourcesService,
    private readonly resourceCommentQueriesService: ResourceCommentQueriesService,
  ) {}

  @Public()
  @ValidateShare({ trustedInternal: true })
  @Get('roots')
  async getRoots(@ValidatedShare() share: Share) {
    const root = await this.sharedResourcesService.getAndValidateResourceMeta(
      share,
      share.resourceId,
    );
    return {
      root: {
        id: root.id,
        name: root.name,
        has_children: root.hasChildren ?? false,
      },
    };
  }

  @Public()
  @ValidateShare({ trustedInternal: true })
  @Get('filter')
  async filterResources(
    @ValidatedShare() share: Share,
    @Query() requestDto: ResourceFilterRequestDto,
    @Query('parent_id') parentId?: string,
  ) {
    return await this.sharedResourcesService.resourceFilter(
      share,
      parentId ?? share.resourceId,
      requestDto.options,
    );
  }

  @Public()
  @ValidateShare({ trustedInternal: true })
  @Get(':resourceId/list')
  async listResourceChildren(
    @ValidatedShare() share: Share,
    @Param('resourceId') resourceId: string,
    @Query('offset', new ParseIntPipe({ optional: true })) offset: number = 0,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 20,
  ) {
    return await this.sharedResourcesService.getSharedResourceChildrenPage(
      share,
      resourceId,
      { limit, offset },
    );
  }

  @Public()
  @ValidateShare({ trustedInternal: true })
  @Get(':resourceId/comment-threads')
  async listComments(
    @ValidatedShare() share: Share,
    @Param('resourceId') resourceId: string,
    @Query() query: ListResourceCommentThreadsRequestDto,
  ) {
    await this.sharedResourcesService.getAndValidateResource(share, resourceId);
    const result = await this.resourceCommentQueriesService.listThreads(
      share.namespaceId,
      resourceId,
      '',
      query,
      false,
    );
    return {
      ...result,
      items: toSharedCommentThreads(result.items, share.id, resourceId),
    };
  }

  @Public()
  @ValidateShare({ trustedInternal: true })
  @Get(':resourceId')
  async getResource(
    @ValidatedShare() share: Share,
    @Param('resourceId') resourceId: string,
  ): Promise<SharedResourceDto> {
    return await this.sharedResourcesService.getSharedResource(
      share,
      resourceId,
    );
  }
}
