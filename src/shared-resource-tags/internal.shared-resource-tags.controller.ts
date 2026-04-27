import { Controller, Get, Query, UseInterceptors } from '@nestjs/common';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';
import {
  ValidateShare,
  ValidatedShare,
} from 'omniboxd/decorators/validate-share.decorator';
import { ValidateShareInterceptor } from 'omniboxd/interceptor/validate-share.interceptor';
import { FilterTagsRequestDto } from 'omniboxd/resource-tags/dto/filter-tags-request.dto';
import { ListTagsRequestDto } from 'omniboxd/resource-tags/dto/list-tags-request.dto';
import { Share } from 'omniboxd/shares/entities/share.entity';
import { SharedResourceTagsService } from 'omniboxd/shared-resource-tags/shared-resource-tags.service';

@Controller('internal/api/v1/shares/:shareId/tags')
@UseInterceptors(ValidateShareInterceptor)
export class InternalSharedResourceTagsController {
  constructor(
    private readonly sharedResourceTagsService: SharedResourceTagsService,
  ) {}

  @Public()
  @ValidateShare()
  @Get()
  async listTags(
    @ValidatedShare() share: Share,
    @Query() query: ListTagsRequestDto,
  ) {
    return await this.sharedResourceTagsService.listTagsWithCount(share, query);
  }

  @Public()
  @ValidateShare()
  @Get('filter')
  async filterTags(
    @ValidatedShare() share: Share,
    @Query() query: FilterTagsRequestDto,
  ) {
    return await this.sharedResourceTagsService.filterTags(share, query);
  }
}
