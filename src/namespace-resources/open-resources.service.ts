import { HttpStatus, Injectable } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { CreateResourceDto } from 'omniboxd/namespace-resources/dto/create-resource.dto';
import { OpenCreateResourceRequestDto } from 'omniboxd/namespace-resources/dto/open-create-resource-request.dto';
import { OpenListResourcesResponseDto } from 'omniboxd/namespace-resources/dto/open-list-resources-response.dto';
import { ResourceDto } from 'omniboxd/namespace-resources/dto/resource.dto';
import { UpdateResourceDto } from 'omniboxd/namespace-resources/dto/update-resource.dto';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import {
  comparePermission,
  ResourcePermission,
} from 'omniboxd/permissions/resource-permission.enum';
import { ResourceMetaDto } from 'omniboxd/resources/dto/resource-meta.dto';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { TagService } from 'omniboxd/tag/tag.service';
import { WizardTaskService } from 'omniboxd/tasks/wizard-task.service';
import { isEmpty } from 'omniboxd/utils/is-empty';
import { parseHashtags } from 'omniboxd/utils/parse-hashtags';

@Injectable()
export class OpenResourcesService {
  constructor(
    private readonly namespaceResourcesService: NamespaceResourcesService,
    private readonly resourcesService: ResourcesService,
    private readonly permissionsService: PermissionsService,
    private readonly tagService: TagService,
    private readonly wizardTaskService: WizardTaskService,
    private readonly i18n: I18nService,
  ) {}

  async listResources(
    namespaceId: string,
    rootResourceId: string,
    userId: string,
    options?: {
      parentId?: string;
      limit?: number;
      offset?: number;
      summary?: boolean;
    },
  ): Promise<OpenListResourcesResponseDto> {
    const resourceId = await this.resolveResourceId(
      namespaceId,
      rootResourceId,
      options?.parentId,
      userId,
    );
    return await this.namespaceResourcesService.listChildrenWithTotal(
      namespaceId,
      resourceId,
      userId,
      {
        limit: options?.limit,
        offset: options?.offset,
        summary: options?.summary,
      },
    );
  }

  async createResource(
    namespaceId: string,
    rootResourceId: string,
    userId: string,
    data: OpenCreateResourceRequestDto,
  ): Promise<{ id: string; name: string }> {
    const resourceType = data.resource_type ?? ResourceType.DOC;

    if (resourceType === ResourceType.DOC && !data.content) {
      const message = this.i18n.t('resource.errors.contentRequired');
      throw new AppException(
        message,
        'CONTENT_REQUIRED',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (resourceType === ResourceType.FOLDER && !data.name?.trim()) {
      const message = this.i18n.t('resource.errors.nameRequired');
      throw new AppException(message, 'NAME_REQUIRED', HttpStatus.BAD_REQUEST);
    }

    if (resourceType === ResourceType.FOLDER && data.content !== undefined) {
      const message = this.i18n.t('resource.errors.contentNotAllowedForFolder');
      throw new AppException(
        message,
        'CONTENT_NOT_ALLOWED_FOR_FOLDER',
        HttpStatus.BAD_REQUEST,
      );
    }

    let tagIds: string[] | undefined = data.tag_ids;
    if (
      resourceType === ResourceType.DOC &&
      !data.skip_parsing_tags_from_content
    ) {
      const hashtagNames = parseHashtags(data.content || '');
      if (hashtagNames.length > 0) {
        const hashtagIds = await this.tagService.getOrCreateTagsByNames(
          namespaceId,
          hashtagNames,
        );
        tagIds = Array.from(new Set([...(tagIds || []), ...hashtagIds]));
      }
    }

    const parentId = await this.resolveResourceId(
      namespaceId,
      rootResourceId,
      data.parent_id,
      userId,
    );

    const createResourceDto = {
      name: data.name || '',
      content: data.content,
      tag_ids: tagIds,
      attrs: data.attrs || {},
      resourceType,
      parentId,
    } as CreateResourceDto;

    const newResource = await this.namespaceResourcesService.create(
      userId,
      namespaceId,
      createResourceDto,
    );

    if (
      resourceType === ResourceType.DOC &&
      !isEmpty(newResource.content?.trim())
    ) {
      if (isEmpty(newResource.name?.trim())) {
        await this.wizardTaskService.emitGenerateTitleTask(
          userId,
          namespaceId,
          { resource_id: newResource.id },
          { content: data.content || '' },
        );
      }
      if (!data.skip_parsing_tags_from_content && isEmpty(newResource.tagIds)) {
        await this.wizardTaskService.emitExtractTagsTask(
          userId,
          newResource.id,
          namespaceId,
          newResource.content,
        );
      }
    }

    return { id: newResource.id, name: newResource.name };
  }

  async uploadFile(
    namespaceId: string,
    rootResourceId: string,
    userId: string,
    file: Express.Multer.File | undefined,
    parsedContent?: string,
  ): Promise<{ id: string; name: string }> {
    if (!file) {
      const message = this.i18n.t('resource.errors.fileRequired');
      throw new AppException(message, 'FILE_REQUIRED', HttpStatus.BAD_REQUEST);
    }

    const newResource = await this.namespaceResourcesService.uploadFile(
      userId,
      namespaceId,
      file,
      rootResourceId,
      'open_api',
      parsedContent,
    );
    return { id: newResource.id, name: newResource.name };
  }

  async getResource(
    namespaceId: string,
    rootResourceId: string,
    userId: string,
    resourceId: string,
  ): Promise<ResourceDto> {
    await this.resolveResourceId(
      namespaceId,
      rootResourceId,
      resourceId,
      userId,
    );
    return await this.namespaceResourcesService.getResource({
      namespaceId,
      resourceId,
      userId,
    });
  }

  async updateResource(
    namespaceId: string,
    rootResourceId: string,
    userId: string,
    resourceId: string,
    data: UpdateResourceDto,
  ): Promise<ResourceDto> {
    await this.resolveResourceId(
      namespaceId,
      rootResourceId,
      resourceId,
      userId,
      ResourcePermission.CAN_EDIT,
    );
    if (data.parentId) {
      await this.resolveResourceId(
        namespaceId,
        rootResourceId,
        data.parentId,
        userId,
        ResourcePermission.CAN_EDIT,
      );
    }

    await this.namespaceResourcesService.update(
      namespaceId,
      userId,
      resourceId,
      data,
    );
    return await this.namespaceResourcesService.getResource({
      namespaceId,
      resourceId,
      userId,
    });
  }

  async deleteResource(
    namespaceId: string,
    rootResourceId: string,
    userId: string,
    resourceId: string,
  ): Promise<void> {
    await this.resolveResourceId(
      namespaceId,
      rootResourceId,
      resourceId,
      userId,
      ResourcePermission.CAN_EDIT,
    );
    await this.namespaceResourcesService.delete(
      userId,
      namespaceId,
      resourceId,
    );
  }

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
