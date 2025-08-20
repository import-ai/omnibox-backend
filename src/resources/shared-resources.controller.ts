import * as bcrypt from 'bcrypt';
import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  UnauthorizedException,
} from '@nestjs/common';
import { ResourcesService } from './resources.service';
import { SharesService } from 'omniboxd/shares/shares.service';
import { SharedResourceDto, ResourceMetaDto } from './dto/resource.dto';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { CookieAuth } from 'omniboxd/auth/decorators';
import { Cookies } from 'omniboxd/decorators/cookie.decorators';

@Controller('api/v1/shares/:shareId/resources')
export class SharedResourcesController {
  constructor(
    private readonly resourcesService: ResourcesService,
    private readonly sharesService: SharesService,
  ) {}

  @CookieAuth({ onAuthFail: 'continue' })
  @Get(':resourceId')
  async getResource(
    @Param('shareId') shareId: string,
    @Param('resourceId') resourceId: string,
    @Cookies('share-password') password: string,
    @UserId({ optional: true }) userId?: string,
  ): Promise<SharedResourceDto> {
    const share = await this.sharesService.getShareById(shareId);
    if (!share || !share.enabled) {
      throw new NotFoundException(`No share found with id ${shareId}`);
    }

    // Check if share has expired
    if (share.expiresAt && share.expiresAt < new Date()) {
      throw new NotFoundException(`No share found with id ${shareId}`);
    }

    if (share.requireLogin && !userId) {
      throw new UnauthorizedException('This share requires login');
    }

    if (share.password) {
      if (!password) {
        throw new ForbiddenException(`Invalid password for share ${shareId}`);
      }
      const match = await bcrypt.compare(password, share.password);
      if (!match) {
        throw new ForbiddenException(`Invalid password for share ${shareId}`);
      }
    }
    const resource = await this.resourcesService.get(resourceId);
    if (!resource || resource.namespaceId != share.namespaceId) {
      throw new NotFoundException(`No resource found with id ${resourceId}`);
    }
    if (resource.id !== share.resourceId) {
      const parents = await this.resourcesService.getParentResources(
        share.namespaceId,
        resource.parentId,
      );
      if (!parents.map((r) => r.id).includes(share.resourceId)) {
        throw new NotFoundException(`No resource found with id ${resourceId}`);
      }
    }
    return SharedResourceDto.fromEntity(resource);
  }

  @CookieAuth({ onAuthFail: 'continue' })
  @Get(':resourceId/children')
  async getResourceChildren(
    @Param('shareId') shareId: string,
    @Param('resourceId') resourceId: string,
    @Cookies('share-password') password: string,
    @UserId({ optional: true }) userId?: string,
  ): Promise<ResourceMetaDto[]> {
    const share = await this.sharesService.getShareById(shareId);
    if (!share || !share.enabled) {
      throw new NotFoundException(`No share found with id ${shareId}`);
    }

    if (share.expiresAt && share.expiresAt < new Date()) {
      throw new NotFoundException(`No share found with id ${shareId}`);
    }

    if (share.requireLogin && !userId) {
      throw new UnauthorizedException('This share requires login');
    }

    if (share.password) {
      if (!password) {
        throw new ForbiddenException(`Invalid password for share ${shareId}`);
      }
      const match = await bcrypt.compare(password, share.password);
      if (!match) {
        throw new ForbiddenException(`Invalid password for share ${shareId}`);
      }
    }

    const resource = await this.resourcesService.get(resourceId);
    if (!resource || resource.namespaceId != share.namespaceId) {
      throw new NotFoundException(`No resource found with id ${resourceId}`);
    }

    if (resource.id !== share.resourceId) {
      const parents = await this.resourcesService.getParentResources(
        share.namespaceId,
        resource.parentId,
      );
      if (!parents.map((r) => r.id).includes(share.resourceId)) {
        throw new NotFoundException(`No resource found with id ${resourceId}`);
      }
    }

    return await this.resourcesService.getResourceChildren(
      share.namespaceId,
      resourceId,
    );
  }
}
