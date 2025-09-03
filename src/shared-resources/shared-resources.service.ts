import { Injectable, NotFoundException } from '@nestjs/common';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { SharesService } from 'omniboxd/shares/shares.service';
import { SharedResourceDto } from './dto/shared-resource.dto';
import { Resource } from 'omniboxd/resources/entities/resource.entity';
import { Share } from 'omniboxd/shares/entities/share.entity';
import { SharedResourceMetaDto } from './dto/shared-resource-meta.dto';
import { ResourcesService } from 'omniboxd/resources/resources.service';

@Injectable()
export class SharedResourcesService {
  constructor(
    private readonly namespaceResourcesService: NamespaceResourcesService,
    private readonly sharesService: SharesService,
    private readonly resourcesService: ResourcesService,
  ) {}

  async getSharedResource(
    shareId: string,
    resourceId: string,
    password?: string,
    userId?: string,
  ): Promise<SharedResourceDto> {
    const share = await this.sharesService.getAndValidateShare(
      shareId,
      password,
      userId,
    );
    const resource = await this.getAndValidateResource(share, resourceId);
    return SharedResourceDto.fromEntity(resource);
  }

  async getSharedResourceChildren(
    shareId: string,
    resourceId: string,
    password?: string,
    userId?: string,
  ): Promise<SharedResourceMetaDto[]> {
    const share = await this.sharesService.getAndValidateShare(
      shareId,
      password,
      userId,
    );
    const resource = await this.getAndValidateResource(share, resourceId);
    if (!share.allResources) {
      return [];
    }
    const children = await this.namespaceResourcesService.getResourceChildren(
      share.namespaceId,
      resource.id,
    );
    return children.map((child) => SharedResourceMetaDto.fromEntity(child));
  }

  async getAndValidateResource(
    share: Share,
    resourceId: string,
  ): Promise<Resource> {
    const resource = await this.namespaceResourcesService.get(resourceId);
    if (!resource || resource.namespaceId != share.namespaceId) {
      throw new NotFoundException('Resource not found');
    }
    if (resource.id !== share.resourceId) {
      const parents = await this.resourcesService.getParentResourcesOrFail(
        share.namespaceId,
        resource.parentId,
      );
      if (!parents.map((r) => r.id).includes(share.resourceId)) {
        throw new NotFoundException('Resource not found');
      }
    }
    return resource;
  }
}
