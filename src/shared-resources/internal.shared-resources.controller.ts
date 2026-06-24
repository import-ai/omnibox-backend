import { Controller, Get, Param, Query, UseInterceptors } from '@nestjs/common';
import { Public } from 'omniboxd/auth';
import {
  ValidatedShare,
  ValidateShare,
} from 'omniboxd/decorators/validate-share.decorator';
import { ValidateShareInterceptor } from 'omniboxd/interceptor/validate-share.interceptor';
import { Share } from 'omniboxd/shares/entities/share.entity';

import { SharedResourceDto } from './dto/shared-resource.dto';
import { SharedResourcesService } from './shared-resources.service';

@Controller('internal/api/v1/shares/:shareId/resources')
@UseInterceptors(ValidateShareInterceptor)
export class InternalSharedResourcesController {
  constructor(
    private readonly sharedResourcesService: SharedResourcesService,
  ) {}

  @Public()
  @ValidateShare()
  @Get(':resourceId/list')
  async listResourceChildren(
    @ValidatedShare() share: Share,
    @Param('resourceId') resourceId: string,
    @Query('offset') offset: number = 0,
    @Query('limit') limit: number = 20,
  ) {
    const children =
      await this.sharedResourcesService.getSharedResourceChildren(
        share,
        resourceId,
      );
    return {
      resources: children.slice(offset, offset + limit),
      total: children.length,
    };
  }

  @Public()
  @ValidateShare()
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
