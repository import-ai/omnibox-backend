import { Injectable, HttpStatus } from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';
import { SharedResourceDto } from './dto/shared-resource.dto';
import { Resource } from 'omniboxd/resources/entities/resource.entity';
import { Share } from 'omniboxd/shares/entities/share.entity';
import { SharedResourceMetaDto } from './dto/shared-resource-meta.dto';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { ResourceMetaDto } from 'omniboxd/resources/dto/resource-meta.dto';

@Injectable()
export class SharedResourcesService {
  constructor(
    private readonly resourcesService: ResourcesService,
    private readonly i18n: I18nService,
  ) {}

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
    const children = await this.resourcesService.getChildren(
      share.namespaceId,
      [resource.id],
    );
    const childMetas = children.map((r) => ResourceMetaDto.fromEntity(r));
    const resourceMetas: SharedResourceMetaDto[] = [];
    for (const child of childMetas) {
      const subChildren = await this.resourcesService.getChildren(
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
      const message = this.i18n.t('resource.errors.resourceNotFound');
      throw new AppException(
        message,
        'RESOURCE_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
    if (resource.id !== share.resourceId) {
      const parents = await this.resourcesService.getParentResourcesOrFail(
        share.namespaceId,
        resource.parentId,
      );
      if (!parents.map((r) => r.id).includes(share.resourceId)) {
        const message = this.i18n.t('resource.errors.resourceNotFound');
        throw new AppException(
          message,
          'RESOURCE_NOT_FOUND',
          HttpStatus.NOT_FOUND,
        );
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
      ? await this.resourcesService.getAllSubResources(share.namespaceId, [
          rootResource.id,
        ])
      : [];

    const allResources = [
      ResourceMetaDto.fromEntity(rootResource),
      ...subResources,
    ];
    return allResources.map((r) => SharedResourceMetaDto.fromResourceMeta(r));
  }
}
