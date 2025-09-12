import { Controller, Get, Param, UseInterceptors } from '@nestjs/common';
import { SharedResourcesService } from './shared-resources.service';
import { SharedResourceDto } from './dto/shared-resource.dto';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { CookieAuth } from 'omniboxd/auth/decorators';
import { Cookies } from 'omniboxd/decorators/cookie.decorators';
import { SharedResourceMetaDto } from './dto/shared-resource-meta.dto';
import {
  ValidateShare,
  ValidatedShare,
} from 'omniboxd/decorators/validate-share.decorator';
import { ValidateShareInterceptor } from 'omniboxd/interceptor/validate-share.interceptor';
import { Share } from 'omniboxd/shares/entities/share.entity';

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
