import { HttpStatus, Injectable } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { ResourceDto } from 'omniboxd/namespace-resources/dto/resource.dto';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import {
  comparePermission,
  ResourcePermission,
} from 'omniboxd/permissions/resource-permission.enum';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { ResourceMetaDto } from 'omniboxd/resources/dto/resource-meta.dto';
import { TagService } from 'omniboxd/tag/tag.service';

@Injectable()
export class OpenResourcesService {
  constructor(
    private readonly namespaceResourcesService: NamespaceResourcesService,
    private readonly resourcesService: ResourcesService,
    private readonly permissionsService: PermissionsService,
    private readonly tagService: TagService,
    private readonly i18n: I18nService,
  ) {}

  async resolveResourceId(
    namespaceId: string,
    rootResourceId: string,
    resourceId: string | undefined,
    userId: string,
    requiredPermission: ResourcePermission = ResourcePermission.CAN_VIEW,
  ): Promise<string> {
    const effectiveResourceId = resourceId || rootResourceId;
    const resourceMetaMap = await this.resourcesService.batchGetParentResources(
      namespaceId,
      [effectiveResourceId],
    );
    const resource = resourceMetaMap.get(effectiveResourceId);
    if (!resource) {
      const message = this.i18n.t('resource.errors.resourceNotFound');
      throw new AppException(
        message,
        'RESOURCE_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }

    if (!this.isResourceInScope(resourceMetaMap, rootResourceId, resource)) {
      const message = this.i18n.t('auth.errors.notAuthorized');
      throw new AppException(message, 'NOT_AUTHORIZED', HttpStatus.FORBIDDEN);
    }

    const permissionMap = await this.permissionsService.getCurrentPermissions(
      userId,
      namespaceId,
      [...resourceMetaMap.values()],
    );
    const permission = permissionMap.get(effectiveResourceId);
    if (!permission || comparePermission(permission, requiredPermission) < 0) {
      const message = this.i18n.t('auth.errors.notAuthorized');
      throw new AppException(message, 'NOT_AUTHORIZED', HttpStatus.FORBIDDEN);
    }

    return effectiveResourceId;
  }

  async filterResourceScope(
    namespaceId: string,
    rootResourceId: string,
    userId: string,
    resourceIds: string[],
    requiredPermission: ResourcePermission = ResourcePermission.CAN_VIEW,
  ): Promise<string[]> {
    if (resourceIds.length === 0) {
      return [];
    }

    const uniqueResourceIds = Array.from(new Set(resourceIds));
    const resourceMetaMap = await this.resourcesService.batchGetParentResources(
      namespaceId,
      uniqueResourceIds,
    );

    const resources = [...resourceMetaMap.values()];
    const permissionMap = await this.permissionsService.getCurrentPermissions(
      userId,
      namespaceId,
      resources,
    );

    return uniqueResourceIds.filter((resourceId) => {
      const resource = resourceMetaMap.get(resourceId);
      if (!resource) {
        return false;
      }
      const permission = permissionMap.get(resourceId);
      return (
        this.isResourceInScope(resourceMetaMap, rootResourceId, resource) &&
        !!permission &&
        comparePermission(permission, requiredPermission) >= 0
      );
    });
  }

  async addResourceTag(
    namespaceId: string,
    userId: string,
    rootResourceId: string,
    resourceId: string,
    tagName: string,
  ): Promise<ResourceDto> {
    await this.resolveResourceId(
      namespaceId,
      rootResourceId,
      resourceId,
      userId,
      ResourcePermission.CAN_EDIT,
    );
    const resource = await this.resourcesService.getResourceOrFail(
      namespaceId,
      resourceId,
    );
    const tag = await this.tagService.getOrCreateTagByName(
      namespaceId,
      tagName,
    );
    const nextTagIds = Array.from(
      new Set([...(resource.tagIds ?? []), tag.id]),
    );

    await this.namespaceResourcesService.update(
      namespaceId,
      userId,
      resourceId,
      {
        tag_ids: nextTagIds,
      },
    );
    return await this.namespaceResourcesService.getResource({
      namespaceId,
      resourceId,
      userId,
    });
  }

  async removeResourceTag(
    namespaceId: string,
    userId: string,
    rootResourceId: string,
    resourceId: string,
    tagId: string,
  ): Promise<ResourceDto> {
    await this.resolveResourceId(
      namespaceId,
      rootResourceId,
      resourceId,
      userId,
      ResourcePermission.CAN_EDIT,
    );
    const resource = await this.resourcesService.getResourceOrFail(
      namespaceId,
      resourceId,
    );
    const nextTagIds = (resource.tagIds ?? []).filter((id) => id !== tagId);

    await this.namespaceResourcesService.update(
      namespaceId,
      userId,
      resourceId,
      {
        tag_ids: nextTagIds,
      },
    );
    return await this.namespaceResourcesService.getResource({
      namespaceId,
      resourceId,
      userId,
    });
  }

  private isResourceInScope(
    resourceMetaMap: Map<string, ResourceMetaDto>,
    rootResourceId: string,
    resource: ResourceMetaDto,
  ): boolean {
    let current: ResourceMetaDto | undefined = resource;
    while (current) {
      if (current.id === rootResourceId) {
        return true;
      }
      if (!current.parentId) {
        return false;
      }
      current = resourceMetaMap.get(current.parentId);
    }
    return false;
  }
}
