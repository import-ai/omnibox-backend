import * as bcrypt from 'bcrypt';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { SharesService } from 'omniboxd/shares/shares.service';
import { SharedResourceDto } from './dto/shared-resource.dto';
import { Resource } from 'omniboxd/resources/resources.entity';
import { Share } from 'omniboxd/shares/entities/share.entity';
import { PublicShareInfoDto } from './dto/public-share-info.dto';
import { SharedResourceMetaDto } from './dto/shared-resource-meta.dto';

@Injectable()
export class ShareResourcesService {
  constructor(
    private readonly resourcesService: ResourcesService,
    private readonly sharesService: SharesService,
  ) {}

  async getShareInfo(
    shareId: string,
    password?: string,
    userId?: string,
  ): Promise<PublicShareInfoDto> {
    const share = await this.getAndValidateShare(shareId, password, userId);
    const resource = await this.getAndValidateResource(share, share.resourceId);
    return PublicShareInfoDto.fromEntity(share, resource);
  }

  async getSharedResource(
    shareId: string,
    resourceId: string,
    password?: string,
    userId?: string,
  ): Promise<SharedResourceDto> {
    const share = await this.getAndValidateShare(shareId, password, userId);
    const resource = await this.getAndValidateResource(share, resourceId);
    return SharedResourceDto.fromEntity(resource);
  }

  async getSharedResourceChildren(
    shareId: string,
    resourceId: string,
    password?: string,
    userId?: string,
  ): Promise<SharedResourceMetaDto[]> {
    const share = await this.getAndValidateShare(shareId, password, userId);
    const resource = await this.getAndValidateResource(share, resourceId);
    if (!share.allResources) {
      return [];
    }
    const children = await this.resourcesService.getResourceChildren(
      share.namespaceId,
      resource.id,
    );
    return children.map((child) => SharedResourceMetaDto.fromEntity(child));
  }

  private async getAndValidateResource(
    share: Share,
    resourceId: string,
  ): Promise<Resource> {
    const resource = await this.resourcesService.get(resourceId);
    if (!resource || resource.namespaceId != share.namespaceId) {
      throw new NotFoundException('Resource not found');
    }
    if (resource.id !== share.resourceId) {
      const parents = await this.resourcesService.getParentResources(
        share.namespaceId,
        resource.parentId,
      );
      if (!parents.map((r) => r.id).includes(share.resourceId)) {
        throw new NotFoundException('Resource not found');
      }
    }
    return resource;
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
