import { Controller, Get, Param, UseInterceptors } from '@nestjs/common';
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

  @CookieAuth({ onAuthFail: 'continue' })
  @ValidateShare()
  @Get(':resourceId/children')
  async getResourceChildren(
    @Param('resourceId') resourceId: string,
    @ValidatedShare() share: Share,
  ): Promise<SharedResourceMetaDto[]> {
    return await this.sharedResourcesService.getSharedResourceChildren(
      share,
      resourceId,
    );
  }
}
