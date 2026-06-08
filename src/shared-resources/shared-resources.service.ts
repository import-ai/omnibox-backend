import { HttpStatus, Injectable } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { BreadcrumbItemDto } from 'omniboxd/namespace-resources/dto/breadcrumb-item.dto';
import { ResourceMetaDto } from 'omniboxd/resources/dto/resource-meta.dto';
import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { Share } from 'omniboxd/shares/entities/share.entity';
import { SmartFoldersService } from 'omniboxd/smart-folders/smart-folders.service';
import { TagDto } from 'omniboxd/tag/dto/tag.dto';
import { TagService } from 'omniboxd/tag/tag.service';
import { last } from 'omniboxd/utils/arrays';
import { VFSResourceFilterOptionsDto } from 'omniboxd/vfs/dto/filter.request.dto';

import { SharedResourceDto } from './dto/shared-resource.dto';
import { SharedResourceMetaDto } from './dto/shared-resource-meta.dto';

@Injectable()
export class SharedResourcesService {
  constructor(
    private readonly resourcesService: ResourcesService,
    private readonly smartFoldersService: SmartFoldersService,
    private readonly tagService: TagService,
    private readonly i18n: I18nService,
  ) {}

  private getShareOwnerIdOrFail(share: Share): string {
    if (share.userId) {
      return share.userId;
    }

    throw new AppException(
      this.i18n.t('share.errors.shareNotFound', {
        args: { shareId: share.id },
      }),
      'SHARE_NOT_FOUND',
      HttpStatus.NOT_FOUND,
    );
  }

  async getSharedResource(
    share: Share,
    resourceId: string,
  ): Promise<SharedResourceDto> {
    const resource = await this.getAndValidateResource(share, resourceId);
    const tags = await this.getTagsForResource(share.namespaceId, resource);
    const path = await this.getResourcePath(share, resource);
    return SharedResourceDto.fromEntity(resource, tags, path);
  }

  private async getTagsForResource(
    namespaceId: string,
    resource: Resource,
  ): Promise<TagDto[]> {
    if (!resource.tagIds || resource.tagIds.length === 0) {
      return [];
    }
    return await this.tagService.getTagsByIds(namespaceId, resource.tagIds);
  }

  private async getResourcePath(
    share: Share,
    resource: Resource,
  ): Promise<BreadcrumbItemDto[]> {
    if (resource.id === share.resourceId) {
      return [];
    }

    const shareRoot = await this.resourcesService.getResource(
      share.namespaceId,
      share.resourceId,
    );
    if (shareRoot?.resourceType === ResourceType.SMART_FOLDER) {
      const ownerUserId = this.getShareOwnerIdOrFail(share);
      const resourceMatched = await this.smartFoldersService.isResourceMatched(
        ownerUserId,
        share.namespaceId,
        share.resourceId,
        resource.id,
      );
      if (resourceMatched) {
        return [
          BreadcrumbItemDto.fromEntity(shareRoot),
          BreadcrumbItemDto.fromEntity(resource),
        ];
      }

      const parentResources =
        await this.resourcesService.getParentResourcesOrFail(
          share.namespaceId,
          resource.parentId,
        );
      const parentPath = parentResources.reverse();
      let firstMatchedFolderIndex = -1;
      for (let index = 0; index < parentPath.length; index++) {
        const parent = parentPath[index];
        if (parent.resourceType !== ResourceType.FOLDER) {
          continue;
        }
        const parentMatched = await this.smartFoldersService.isResourceMatched(
          ownerUserId,
          share.namespaceId,
          share.resourceId,
          parent.id,
        );
        if (parentMatched) {
          firstMatchedFolderIndex = index;
          break;
        }
      }
      const matchedFolderPath =
        firstMatchedFolderIndex < 0
          ? []
          : parentPath.slice(firstMatchedFolderIndex);
      return [
        BreadcrumbItemDto.fromEntity(shareRoot),
        ...matchedFolderPath.map((parent) => ({
          id: parent.id,
          name: parent.name,
        })),
        BreadcrumbItemDto.fromEntity(resource),
      ];
    }

    const parentResources =
      await this.resourcesService.getParentResourcesOrFail(
        share.namespaceId,
        resource.parentId,
      );

    const shareRootIndex = parentResources.findIndex(
      (r) => r.id === share.resourceId,
    );

    const pathResources =
      shareRootIndex === -1
        ? parentResources
        : parentResources.slice(0, shareRootIndex + 1);

    const path: BreadcrumbItemDto[] = [
      ...pathResources.reverse().map((r) => ({ id: r.id, name: r.name })),
      { id: resource.id, name: resource.name },
    ];

    return path;
  }

  async batchGetResourcePath(
    share: Share,
    resourceIds: string[],
  ): Promise<Map<string, ResourceMetaDto[]>> {
    const pathMap = new Map<string, ResourceMetaDto[]>();
    const shareRoot = await this.resourcesService.getResource(
      share.namespaceId,
      share.resourceId,
    );
    const resourceMap = await this.resourcesService.batchGetParentResources(
      share.namespaceId,
      resourceIds,
    );
    for (const resourceId of resourceIds) {
      if (resourceId !== share.resourceId && !share.allResources) {
        throw new AppException(
          this.i18n.t('resource.errors.resourceNotFound'),
          'RESOURCE_NOT_FOUND',
          HttpStatus.NOT_FOUND,
        );
      }
      const resource = resourceMap.get(resourceId);
      if (!resource) {
        throw new AppException(
          this.i18n.t('resource.errors.resourceNotFound'),
          'RESOURCE_NOT_FOUND',
          HttpStatus.NOT_FOUND,
        );
      }

      if (shareRoot?.resourceType === ResourceType.SMART_FOLDER) {
        pathMap.set(
          resourceId,
          await this.getSharedSmartFolderResourcePath(
            share,
            shareRoot,
            resource,
          ),
        );
        continue;
      }

      const path: ResourceMetaDto[] = [resource];
      while (last(path).id != share.resourceId) {
        const parentId = last(path).parentId;
        if (!parentId || !resourceMap.has(parentId)) {
          throw new AppException(
            this.i18n.t('resource.errors.resourceNotFound'),
            'RESOURCE_NOT_FOUND',
            HttpStatus.NOT_FOUND,
          );
        }
        path.push(resourceMap.get(parentId)!);
      }
      pathMap.set(resourceId, path.reverse());
    }

    return pathMap;
  }

  private async getSharedSmartFolderResourcePath(
    share: Share,
    shareRoot: Resource,
    resource: ResourceMetaDto,
  ): Promise<ResourceMetaDto[]> {
    const shareRootMeta = ResourceMetaDto.fromEntity(shareRoot);
    if (resource.id === share.resourceId) {
      return [shareRootMeta];
    }

    const ownerUserId = this.getShareOwnerIdOrFail(share);
    const resourceMatched = await this.smartFoldersService.isResourceMatched(
      ownerUserId,
      share.namespaceId,
      share.resourceId,
      resource.id,
    );
    if (resourceMatched) {
      return [shareRootMeta, resource];
    }

    const parentResources = (
      await this.resourcesService.getParentResourcesOrFail(
        share.namespaceId,
        resource.parentId,
      )
    ).reverse();
    let firstMatchedFolderIndex = -1;
    for (let index = 0; index < parentResources.length; index++) {
      const parent = parentResources[index];
      if (parent.resourceType !== ResourceType.FOLDER) {
        continue;
      }
      const parentMatched = await this.smartFoldersService.isResourceMatched(
        ownerUserId,
        share.namespaceId,
        share.resourceId,
        parent.id,
      );
      if (parentMatched) {
        firstMatchedFolderIndex = index;
        break;
      }
    }

    if (firstMatchedFolderIndex < 0) {
      throw new AppException(
        this.i18n.t('resource.errors.resourceNotFound'),
        'RESOURCE_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }

    return [
      shareRootMeta,
      ...parentResources.slice(firstMatchedFolderIndex),
      resource,
    ];
  }

  private async getSharedSmartFolderMatchedChildren(
    share: Share,
  ): Promise<SharedResourceMetaDto[]> {
    const ownerUserId = this.getShareOwnerIdOrFail(share);
    const children = await this.smartFoldersService.listChildren(
      ownerUserId,
      share.namespaceId,
      share.resourceId,
    );
    return children.map((child) => {
      const dto = new SharedResourceMetaDto();
      dto.id = child.id;
      dto.parentId = share.resourceId;
      dto.name = child.name;
      dto.resourceType = child.resourceType;
      dto.createdAt = child.createdAt;
      dto.updatedAt = child.updatedAt;
      dto.hasChildren = child.hasChildren;
      dto.attrs = { ...child.attrs };
      delete dto.attrs.transcript;
      delete dto.attrs.video_info;
      return dto;
    });
  }

  private async isSharedSmartFolderMatchOrDescendant(
    share: Share,
    resource: Resource,
  ): Promise<boolean> {
    const ownerUserId = this.getShareOwnerIdOrFail(share);
    const matched = await this.smartFoldersService.isResourceMatched(
      ownerUserId,
      share.namespaceId,
      share.resourceId,
      resource.id,
    );
    if (matched) {
      return true;
    }

    const parents = await this.resourcesService.getParentResourcesOrFail(
      share.namespaceId,
      resource.parentId,
    );
    for (const parent of parents) {
      if (parent.resourceType !== ResourceType.FOLDER) {
        continue;
      }
      const parentMatched = await this.smartFoldersService.isResourceMatched(
        ownerUserId,
        share.namespaceId,
        share.resourceId,
        parent.id,
      );
      if (parentMatched) {
        return true;
      }
    }

    return false;
  }

  async getSharedResourceChildren(
    share: Share,
    resourceId: string,
  ): Promise<SharedResourceMetaDto[]> {
    const resource = await this.getAndValidateResource(share, resourceId);
    const shareRoot = await this.resourcesService.getResource(
      share.namespaceId,
      share.resourceId,
    );

    if (!share.allResources) {
      return [];
    }

    if (
      shareRoot?.resourceType === ResourceType.SMART_FOLDER &&
      resource.id !== share.resourceId &&
      !(await this.isSharedSmartFolderMatchOrDescendant(share, resource))
    ) {
      return [];
    }

    if (resource.resourceType === ResourceType.SMART_FOLDER) {
      return await this.getSharedSmartFolderMatchedChildren(share);
    }

    const children = await this.resourcesService.getChildren(
      share.namespaceId,
      [resource.id],
    );
    if (children.length === 0) {
      return [];
    }

    const subChildren = await this.resourcesService.getChildren(
      share.namespaceId,
      children.map((child) => child.id),
    );
    const parentIds = new Set(
      subChildren
        .map((child) => child.parentId)
        .filter((parentId): parentId is string => parentId !== null),
    );
    return children.map((child) =>
      SharedResourceMetaDto.fromResourceMeta(
        share,
        ResourceMetaDto.fromEntity(child),
        parentIds.has(child.id),
      ),
    );
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
      const rootResource = await this.resourcesService.getResource(
        share.namespaceId,
        share.resourceId,
      );
      if (rootResource?.resourceType === ResourceType.SMART_FOLDER) {
        if (!share.allResources) {
          const message = this.i18n.t('resource.errors.resourceNotFound');
          throw new AppException(
            message,
            'RESOURCE_NOT_FOUND',
            HttpStatus.NOT_FOUND,
          );
        }
        if (await this.isSharedSmartFolderMatchOrDescendant(share, resource)) {
          return resource;
        }
        const message = this.i18n.t('resource.errors.resourceNotFound');
        throw new AppException(
          message,
          'RESOURCE_NOT_FOUND',
          HttpStatus.NOT_FOUND,
        );
      }
      if (!share.allResources) {
        const message = this.i18n.t('resource.errors.resourceNotFound');
        throw new AppException(
          message,
          'RESOURCE_NOT_FOUND',
          HttpStatus.NOT_FOUND,
        );
      }
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

  async getAndValidateResourceMeta(
    share: Share,
    resourceId: string,
  ): Promise<SharedResourceMetaDto> {
    const resource = await this.getAndValidateResource(share, resourceId);
    let hasChildren = false;
    if (
      share.allResources &&
      resource.resourceType !== ResourceType.SMART_FOLDER
    ) {
      const children = await this.resourcesService.getChildren(
        share.namespaceId,
        [resource.id],
      );
      hasChildren = children.length > 0;
    }

    return SharedResourceMetaDto.fromResourceMeta(
      share,
      ResourceMetaDto.fromEntity(resource),
      hasChildren,
    );
  }

  async getAllSharedResources(share: Share): Promise<SharedResourceMetaDto[]> {
    return await this.getAllSubResources(share, share.resourceId);
  }

  async getAllSubResources(
    share: Share,
    parentId: string,
  ): Promise<SharedResourceMetaDto[]> {
    const parent = await this.getAndValidateResourceMeta(share, parentId);
    if (!parent) {
      return [];
    }
    if (parent.resourceType === ResourceType.SMART_FOLDER) {
      if (!share.allResources) {
        return [parent];
      }
      return [
        parent,
        ...(await this.getSharedSmartFolderMatchedChildren(share)),
      ];
    }
    const subResources = share.allResources
      ? await this.resourcesService.getAllSubResources(share.namespaceId, [
          parent.id,
        ])
      : [];
    const parentIdsWithChildren = new Set(
      subResources
        .map((resource) => resource.parentId)
        .filter((parentId) => parentId !== null),
    );
    const subResMeta = subResources.map((r) =>
      SharedResourceMetaDto.fromResourceMeta(
        share,
        r,
        parentIdsWithChildren.has(r.id),
      ),
    );
    return [parent, ...subResMeta];
  }

  async resourceFilter(
    share: Share,
    rootResourceId: string,
    options?: VFSResourceFilterOptionsDto,
  ): Promise<{ resources: SharedResourceMetaDto[]; total: number }> {
    const allResources = await this.getAllSubResources(share, rootResourceId);
    const allResourceMap = new Map(
      allResources.map((resource) => [resource.id, resource]),
    );
    const resourceIds = allResources.map((resource) => resource.id);
    if (resourceIds.length === 0) {
      return { resources: [], total: 0 };
    }
    let tagIds: string[] | undefined = undefined;
    if (options?.tagPattern) {
      const tagEntities = await this.tagService.findByPattern(
        share.namespaceId,
        options.tagPattern,
      );
      tagIds = tagEntities.map((tag) => tag.id);
    }
    const { resources, total } = await this.resourcesService.resourceFilter(
      share.namespaceId,
      resourceIds,
      {
        ...options,
        tagIds,
      },
    );
    return {
      resources: resources
        .map((resource) => allResourceMap.get(resource.id))
        .filter((r) => r !== undefined),
      total,
    };
  }
}
