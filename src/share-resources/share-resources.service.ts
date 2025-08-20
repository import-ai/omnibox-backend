import * as bcrypt from 'bcrypt';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { SharesService } from 'omniboxd/shares/shares.service';
import {
  SharedResourceDto,
  ResourceMetaDto,
} from 'omniboxd/resources/dto/resource.dto';

@Injectable()
export class ShareResourcesService {
  constructor(
    private readonly resourcesService: ResourcesService,
    private readonly sharesService: SharesService,
  ) {}

  async getSharedResource(
    shareId: string,
    resourceId: string,
    password?: string,
    userId?: string,
  ): Promise<SharedResourceDto> {
    const share = await this.getAndValidateShare(shareId, password, userId);

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

  async getSharedResourceChildren(
    shareId: string,
    resourceId: string,
    password?: string,
    userId?: string,
  ): Promise<ResourceMetaDto[]> {
    const share = await this.getAndValidateShare(shareId, password, userId);

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

  private async getAndValidateShare(
    shareId: string,
    password?: string,
    userId?: string,
  ) {
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

    return share;
  }
}
