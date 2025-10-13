import { Injectable, NotFoundException } from '@nestjs/common';
import { SharedResourceDto } from './dto/shared-resource.dto';
import { Resource } from 'omniboxd/resources/entities/resource.entity';
import { Share } from 'omniboxd/shares/entities/share.entity';
import { SharedResourceMetaDto } from './dto/shared-resource-meta.dto';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { ResourceMetaDto } from 'omniboxd/resources/dto/resource-meta.dto';

@Injectable()
export class SharedResourcesService {
  constructor(private readonly resourcesService: ResourcesService) {}

  async getSharedResource(
    share: Share,
    resourceId: string,
  ): Promise<SharedResourceDto> {
    const resource = await this.getAndValidateResource(share, resourceId);
    return SharedResourceDto.fromEntity(resource);
  }

  async getSharedResourceChildren(
    share: Share,
    resourceId: string,
  ): Promise<SharedResourceMetaDto[]> {
    const resource = await this.getAndValidateResource(share, resourceId);
    if (!share.allResources) {
      return [];
    }
    const children = await this.resourcesService.getSubResources(
      share.namespaceId,
      [resource.id],
    );
    const resourceMetas: SharedResourceMetaDto[] = [];
    for (const child of children) {
      const subChildren = await this.resourcesService.getSubResources(
        share.namespaceId,
        [child.id],
      );
      const meta = SharedResourceMetaDto.fromResourceMeta(
        child,
        subChildren.length > 0,
      );
      resourceMetas.push(meta);
    }
    return resourceMetas;
  }

  async getAndValidateResource(
    share: Share,
    resourceId: string,
  ): Promise<Resource> {
    const resource = await this.resourcesService.getResource(
      share.namespaceId,
      resourceId,
    );
    if (!resource) {
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

  async getAllSharedResources(share: Share): Promise<SharedResourceMetaDto[]> {
    const rootResource = await this.resourcesService.getResource(
      share.namespaceId,
      share.resourceId,
    );
    if (!rootResource) {
      return [];
    }

    const subResources = share.allResources
      ? await this.resourcesService.getAllSubResources(
          share.namespaceId,
          rootResource.id,
        )
      : [];

    const allResources = [
      ResourceMetaDto.fromEntity(rootResource),
      ...subResources,
    ];
    return allResources.map((r) => SharedResourceMetaDto.fromResourceMeta(r));
  }
}
