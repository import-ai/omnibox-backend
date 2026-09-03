import { HttpStatus, Injectable, Optional } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { BreadcrumbItemDto } from 'omniboxd/namespace-resources/dto/breadcrumb-item.dto';
import { ResourceCommentsService } from 'omniboxd/resource-comments/resource-comments.service';
import { ResourceFilterOptionsDto } from 'omniboxd/resources/dto/resource-filter.request.dto';
import { ResourceMetaDto } from 'omniboxd/resources/dto/resource-meta.dto';
import {
  isContainerResourceType,
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';
import {
  ResourceSortBy,
  ResourceSortOrder,
  sortResources,
} from 'omniboxd/resources/resource-sort';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { Share } from 'omniboxd/shares/entities/share.entity';
import { SmartFoldersService } from 'omniboxd/smart-folders/smart-folders.service';
import { TagDto } from 'omniboxd/tag/dto/tag.dto';
import { TagService } from 'omniboxd/tag/tag.service';
import { last } from 'omniboxd/utils/arrays';

import { SharedResourceDto } from './dto/shared-resource.dto';
import { SharedResourceMetaDto } from './dto/shared-resource-meta.dto';

export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

export interface SharedChildrenPage {
  resources: SharedResourceMetaDto[];
  total: number;
}

// Same window semantics as the workspace children listing: no limit means the
// whole (remaining) listing.
function paginate<T>(items: T[], options?: PaginationOptions): T[] {
  const offset = Math.max(0, options?.offset ?? 0);
  const limit =
    options?.limit === undefined ? undefined : Math.max(1, options.limit);
  return limit === undefined
    ? items.slice(offset)
    : items.slice(offset, offset + limit);
}

@Injectable()
export class SharedResourcesService {
  constructor(
    private readonly resourcesService: ResourcesService,
    private readonly smartFoldersService: SmartFoldersService,
    private readonly tagService: TagService,
    private readonly i18n: I18nService,
    @Optional()
    private readonly resourceCommentsService?: ResourceCommentsService,
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
    const dto = SharedResourceDto.fromEntity(resource, tags, path);
    if (this.resourceCommentsService) {
      const comments =
        await this.resourceCommentsService.getResourceCommentData(
          share.namespaceId,
          resource.id,
          resource.content,
        );
      dto.content_hash = comments.content_hash;
      dto.comment_threads = comments.comment_threads;
    }
    return dto;
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
        if (!isContainerResourceType(parent.resourceType)) {
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
      if (!isContainerResourceType(parent.resourceType)) {
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
    options?: PaginationOptions,
  ): Promise<SharedChildrenPage> {
    const ownerUserId = this.getShareOwnerIdOrFail(share);
    const { resources, total } =
      await this.smartFoldersService.listChildrenWithTotal(
        ownerUserId,
        share.namespaceId,
        share.resourceId,
        { limit: options?.limit, offset: options?.offset },
      );
    return {
      resources: resources.map((child) => {
        const dto = new SharedResourceMetaDto();
        dto.id = child.id;
        dto.parentId = share.resourceId;
        dto.name = child.name;
        dto.resourceType = child.resourceType;
        dto.readOnly = child.readOnly;
        dto.createdAt = child.createdAt;
        dto.updatedAt = child.updatedAt;
        dto.hasChildren = child.hasChildren;
        dto.attrs = { ...child.attrs };
        delete dto.attrs.transcript;
        delete dto.attrs.video_info;
        return dto;
      }),
      total,
    };
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
      if (!isContainerResourceType(parent.resourceType)) {
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
    options?: PaginationOptions,
  ): Promise<SharedResourceMetaDto[]> {
    const { resources } = await this.getSharedResourceChildrenPage(
      share,
      resourceId,
      options,
    );
    return resources;
  }

  // Pages a shared folder's children exactly like the workspace listing does:
  // a viewer of a share holding thousands of rss items must be able to read a
  // page at a time, and `total` lets a caller size the listing without walking
  // it. Omitting the limit keeps the whole listing, as before.
  async getSharedResourceChildrenPage(
    share: Share,
    resourceId: string,
    options?: PaginationOptions,
  ): Promise<SharedChildrenPage> {
    const resource = await this.getAndValidateResource(share, resourceId);
    const shareRoot = await this.resourcesService.getResource(
      share.namespaceId,
      share.resourceId,
    );

    if (
      !share.allResources &&
      ![
        ResourceType.FOLDER,
        ResourceType.SMART_FOLDER,
        ResourceType.RSS_FOLDER,
      ].includes(resource.resourceType)
    ) {
      return { resources: [], total: 0 };
    }

    if (
      shareRoot?.resourceType === ResourceType.SMART_FOLDER &&
      resource.id !== share.resourceId &&
      !(await this.isSharedSmartFolderMatchOrDescendant(share, resource))
    ) {
      return { resources: [], total: 0 };
    }

    if (resource.resourceType === ResourceType.SMART_FOLDER) {
      return await this.getSharedSmartFolderMatchedChildren(share, options);
    }

    const children = await this.resourcesService.getChildren(
      share.namespaceId,
      [resource.id],
    );
    if (children.length === 0) {
      return { resources: [], total: 0 };
    }

    // A feed reads newest-published first wherever it is shown, and the share's
    // own sort is about the resources its owner arranged, not about the
    // articles a poller filed under an rss folder.
    const sortOptions =
      resource.resourceType === ResourceType.RSS_FOLDER
        ? {
            sortBy: ResourceSortBy.CREATED_AT,
            sortOrder: ResourceSortOrder.DESC,
          }
        : { sortBy: share.sortBy, sortOrder: share.sortOrder };
    const sorted = sortResources(children, sortOptions);
    const page = paginate(sorted, options);
    if (page.length === 0) {
      return { resources: [], total: sorted.length };
    }

    // Only the page being returned needs a has-children lookup; asking for the
    // whole listing's descendants would put every child id in one IN list.
    const subChildren = await this.resourcesService.getChildren(
      share.namespaceId,
      page.map((child) => child.id),
    );
    const parentIds = new Set(
      subChildren
        .map((child) => child.parentId)
        .filter((parentId): parentId is string => parentId !== null),
    );
    return {
      resources: page.map((child) =>
        SharedResourceMetaDto.fromResourceMeta(
          share,
          ResourceMetaDto.fromEntity(child),
          parentIds.has(child.id),
        ),
      ),
      total: sorted.length,
    };
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
        // An rss folder's items are its content rather than independent
        // resources: sharing the folder shares the articles it collected, so
        // they stay reachable even when the share covers only its root.
        const isSharedRssFolderItem =
          rootResource?.resourceType === ResourceType.RSS_FOLDER &&
          resource.resourceType === ResourceType.RSS_ITEM &&
          resource.parentId === share.resourceId;
        if (!isSharedRssFolderItem) {
          const message = this.i18n.t('resource.errors.resourceNotFound');
          throw new AppException(
            message,
            'RESOURCE_NOT_FOUND',
            HttpStatus.NOT_FOUND,
          );
        }
        return resource;
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
      const { resources } =
        await this.getSharedSmartFolderMatchedChildren(share);
      return [parent, ...resources];
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
    options?: ResourceFilterOptionsDto,
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
