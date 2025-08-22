import { Controller, Get, Param } from '@nestjs/common';
import { SharedResourcesService } from './shared-resources.service';
import { SharedResourceDto } from './dto/shared-resource.dto';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { CookieAuth } from 'omniboxd/auth/decorators';
import { Cookies } from 'omniboxd/decorators/cookie.decorators';
import { SharedResourceMetaDto } from './dto/shared-resource-meta.dto';

@Controller('api/v1/shares/:shareId/resources')
export class SharedResourcesController {
  constructor(
    private readonly sharedResourcesService: SharedResourcesService,
  ) {}

  @CookieAuth({ onAuthFail: 'continue' })
  @Get(':resourceId')
  async getResource(
    @Param('shareId') shareId: string,
    @Param('resourceId') resourceId: string,
    @Cookies('share-password') password: string,
    @UserId({ optional: true }) userId?: string,
  ): Promise<SharedResourceDto> {
    return await this.sharedResourcesService.getSharedResource(
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
  ): Promise<SharedResourceMetaDto[]> {
    return await this.sharedResourcesService.getSharedResourceChildren(
      shareId,
      resourceId,
      password,
      userId,
    );
  }
}
