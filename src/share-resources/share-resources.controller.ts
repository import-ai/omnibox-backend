import { Controller, Get, Param } from '@nestjs/common';
import { ShareResourcesService } from './share-resources.service';
import { SharedResourceDto } from './dto/shared-resource.dto';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { CookieAuth } from 'omniboxd/auth/decorators';
import { Cookies } from 'omniboxd/decorators/cookie.decorators';
import { ShareResourceMetaDto } from './dto/share-resource-meta.dto';

@Controller('api/v1/shares/:shareId/resources')
export class ShareResourcesController {
  constructor(private readonly shareResourcesService: ShareResourcesService) {}

  @CookieAuth({ onAuthFail: 'continue' })
  @Get(':resourceId')
  async getResource(
    @Param('shareId') shareId: string,
    @Param('resourceId') resourceId: string,
    @Cookies('share-password') password: string,
    @UserId({ optional: true }) userId?: string,
  ): Promise<SharedResourceDto> {
    return await this.shareResourcesService.getSharedResource(
      shareId,
      resourceId,
      password,
      userId,
    );
  }

  @CookieAuth({ onAuthFail: 'continue' })
  @Get(':resourceId/children')
  async getResourceChildren(
    @Param('shareId') shareId: string,
    @Param('resourceId') resourceId: string,
    @Cookies('share-password') password: string,
    @UserId({ optional: true }) userId?: string,
  ): Promise<ShareResourceMetaDto[]> {
    return await this.shareResourcesService.getSharedResourceChildren(
      shareId,
      resourceId,
      password,
      userId,
    );
  }
}

@Controller('api/v1/shares/:shareId')
export class SharesController {
  constructor(private readonly shareResourcesService: ShareResourcesService) {}

  @CookieAuth({ onAuthFail: 'continue' })
  @Get()
  async getShareInfo(
    @Param('shareId') shareId: string,
    @Cookies('share-password') password: string,
    @UserId({ optional: true }) userId?: string,
  ) {
    return await this.shareResourcesService.getShareInfo(
      shareId,
      password,
      userId,
    );
  }
}
