import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import { Response } from 'express';
import { CookieAuth } from 'omniboxd/auth/decorators';
import {
  ValidatedShare,
  ValidateShare,
} from 'omniboxd/decorators/validate-share.decorator';
import { ValidateShareInterceptor } from 'omniboxd/interceptor/validate-share.interceptor';
import { Share } from 'omniboxd/shares/entities/share.entity';

import { SharedResourceDto } from './dto/shared-resource.dto';
import { SharedResourceMetaDto } from './dto/shared-resource-meta.dto';
import { SharedResourcesService } from './shared-resources.service';

@Controller('api/v1/shares/:shareId/resources')
@UseInterceptors(ValidateShareInterceptor)
export class SharedResourcesController {
  constructor(
    private readonly sharedResourcesService: SharedResourcesService,
  ) {}

  @CookieAuth({ onAuthFail: 'continue' })
  @ValidateShare()
  @Get(':resourceId')
  async getResource(
    @Param('resourceId') resourceId: string,
    @ValidatedShare() share: Share,
  ): Promise<SharedResourceDto> {
    return await this.sharedResourcesService.getSharedResource(
      share,
      resourceId,
    );
  }

  // Paged like the workspace children listing: a viewer must be able to read a
  // shared folder holding thousands of rss items a page at a time. The body
  // stays a plain array (the folder view shares one client for both listings);
  // the full count is reported in X-Total-Count.
  @CookieAuth({ onAuthFail: 'continue' })
  @ValidateShare()
  @Get(':resourceId/children')
  async getResourceChildren(
    @Param('resourceId') resourceId: string,
    @ValidatedShare() share: Share,
    @Res({ passthrough: true }) response: Response,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('offset', new ParseIntPipe({ optional: true })) offset?: number,
  ): Promise<SharedResourceMetaDto[]> {
    const { resources, total } =
      await this.sharedResourcesService.getSharedResourceChildrenPage(
        share,
        resourceId,
        { limit, offset },
      );
    response.setHeader('X-Total-Count', total.toString());
    return resources;
  }
}
