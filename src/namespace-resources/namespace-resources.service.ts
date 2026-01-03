import { InjectRepository } from '@nestjs/typeorm';
import duplicateName from 'omniboxd/utils/duplicate-name';
import {
  DataSource,
  FindOptionsWhere,
  In,
  IsNull,
  Like,
  Not,
  Repository,
} from 'typeorm';
import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';
import { CreateResourceDto } from 'omniboxd/namespace-resources/dto/create-resource.dto';
import { UpdateResourceDto } from 'omniboxd/namespace-resources/dto/update-resource.dto';
import { Injectable, HttpStatus } from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';
import { S3Service } from 'omniboxd/s3/s3.service';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { PrivateSearchResourceDto } from 'omniboxd/wizard/dto/agent-request.dto';
import {
  comparePermission,
  ResourcePermission,
} from 'omniboxd/permissions/resource-permission.enum';
import { Transaction, transaction } from 'omniboxd/utils/transaction-utils';
import { ResourceDto, SpaceType } from './dto/resource.dto';
import { Namespace } from 'omniboxd/namespaces/entities/namespace.entity';
import { TagService } from 'omniboxd/tag/tag.service';
import { TagDto } from 'omniboxd/tag/dto/tag.dto';
import { ResourceAttachmentsService } from 'omniboxd/resource-attachments/resource-attachments.service';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { ResourceMetaDto } from 'omniboxd/resources/dto/resource-meta.dto';
import { SidebarChildDto } from './dto/sidebar-child.dto';
import { ResourceSummaryDto } from './dto/resource-summary.dto';
import { FilesService } from 'omniboxd/files/files.service';
import { CreateFileReqDto } from './dto/create-file-req.dto';
import {
  UploadFileInfoDto,
  InternalFileInfoDto,
  DownloadFileInfoDto,
} from './dto/file-info.dto';
import { getOriginalFileName } from 'omniboxd/utils/encode-filename';
import { InternalResourceDto } from './dto/internal-resource.dto';
import { TrashItemDto } from './dto/trash-item.dto';
import { TrashListResponseDto } from './dto/trash-list-response.dto';

@Injectable()
export class NamespaceResourcesService {
  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    @InjectRepository(Namespace)
    private readonly namespaceRepository: Repository<Namespace>,
    private readonly tagService: TagService,
    private readonly dataSource: DataSource,
    private readonly s3Service: S3Service,
    private readonly permissionsService: PermissionsService,
    private readonly resourceAttachmentsService: ResourceAttachmentsService,
    private readonly resourcesService: ResourcesService,
    private readonly filesService: FilesService,
    private readonly i18n: I18nService,
  ) {}

  private async getTagsByIds(
    namespaceId: string,
    tagIds: string[],
  ): Promise<TagDto[]> {
    return await this.tagService.getTagsByIds(namespaceId, tagIds);
  }

  private async getTagsForResources(
    namespaceId: string,
    resources: Resource[],
  ): Promise<Map<string, TagDto[]>> {
    const resourceTagsMap = new Map<string, TagDto[]>();

    // Get all unique tag IDs from all resources
    const allTagIds = new Set<string>();
    resources.forEach((resource) => {
      if (resource.tagIds) {
        resource.tagIds.forEach((tagId) => allTagIds.add(tagId));
      }
    });

    // Fetch all tags at once
    const tags = await this.getTagsByIds(namespaceId, Array.from(allTagIds));
    const tagsById = new Map(tags.map((tag) => [tag.id, tag]));

    // Build the map for each resource
    resources.forEach((resource) => {
      const resourceTags: TagDto[] = [];
      if (resource.tagIds) {
        resource.tagIds.forEach((tagId) => {
          const tag = tagsById.get(tagId);
          if (tag) {
            resourceTags.push(tag);
          }
        });
      }
      resourceTagsMap.set(resource.id, resourceTags);
    });

    return resourceTagsMap;
  }

  private async getResourceIdsByTagNames(
    namespaceId: string,
    tagNames: string[],
  ): Promise<string[]> {
    if (tagNames.length === 0) {
      return [];
    }

    // Get tag IDs by names using tag service
    const tags = await this.tagService.findByNames(namespaceId, tagNames);
    const tagIds = tags.map((tag) => tag.id);
    if (tagIds.length === 0) {
      return [];
    }

    // Find resources that contain any of these tag IDs
    const resources = await this.resourceRepository
      .createQueryBuilder('resource')
      .where('resource.namespace_id = :namespaceId', { namespaceId })
      .andWhere('resource.tag_ids && :tagIds', { tagIds })
      .select('resource.id')
      .getMany();

    return resources.map((resource) => resource.id);
  }

  async findByIds(namespaceId: string, userId: string, ids: Array<string>) {
    if (ids.length <= 0) {
      return [];
    }
    const resources = await this.resourceRepository.find({
      where: {
        namespaceId,
        id: In(ids),
      },
      select: [
        'id',
        'name',
        'attrs',
        'parentId',
        'createdAt',
        'updatedAt',
        'namespaceId',
        'resourceType',
        'tagIds',
      ],
    });

    const filteredResources = await this.permissionFilter(
      namespaceId,
      userId,
      resources,
    );

    // Populate tags for resources
    const tagsMap = await this.getTagsForResources(
      namespaceId,
      filteredResources,
    );

    return filteredResources.map((resource) => ({
      ...resource,
      tags: tagsMap.get(resource.id) || [],
    }));
  }

  async create(
    userId: string,
    namespaceId: string,
    createReq: CreateResourceDto,
    tx?: Transaction,
    source?: string,
  ) {
    if (!tx) {
      return await transaction(this.dataSource.manager, async (tx) => {
        return await this.create(userId, namespaceId, createReq, tx);
      });
    }

    const manager = tx.entityManager;

    const ok = await this.permissionsService.userHasPermission(
      namespaceId,
      createReq.parentId,
      userId,
      ResourcePermission.CAN_EDIT,
      undefined,
      manager,
    );
    if (!ok) {
      const message = this.i18n.t('auth.errors.notAuthorized');
      throw new AppException(message, 'NOT_AUTHORIZED', HttpStatus.FORBIDDEN);
    }

    const attrs = { ...createReq.attrs };
    if (createReq.file_id) {
      if (createReq.resourceType !== ResourceType.FILE) {
        const message = this.i18n.t('resource.errors.invalidResourceType');
        throw new AppException(
          message,
          'INVALID_RESOURCE_TYPE',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      const file = await this.filesService.getFile(
        namespaceId,
        createReq.file_id,
      );
      if (!file || file.userId !== userId) {
        const message = this.i18n.t('resource.errors.fileNotFound');
        throw new AppException(
          message,
          'FILE_NOT_FOUND',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      attrs.filename = file.name;
      attrs.original_name = file.name;
      attrs.mimetype = file.mimetype;
    }

    return await this.resourcesService.createResource(
      {
        ...createReq,
        namespaceId,
        userId,
        attrs,
        tagIds: createReq.tag_ids,
        fileId: createReq.file_id,
        source,
      },
      tx,
    );
  }

  async duplicate(userId: string, namespaceId: string, resourceId: string) {
    const resource = await this.resourcesService.getResourceOrFail(
      namespaceId,
      resourceId,
    );
    if (!resource.parentId) {
      const message = this.i18n.t('resource.errors.cannotDuplicateRoot');
      throw new AppException(
        message,
        'CANNOT_DUPLICATE_ROOT',
        HttpStatus.BAD_REQUEST,
      );
    }
    const newResource = {
      name: duplicateName(resource.name),
      namespaceId: resource.namespaceId,
      resourceType: resource.resourceType,
      parentId: resource.parentId,
    };
    ['content', 'attrs'].forEach((key) => {
      if (resource[key]) {
        (newResource as any)[key] = resource[key];
      }
    });

    // Handle tagIds separately since DTO expects tag_ids
    if (resource.tagIds) {
      (newResource as any).tag_ids = resource.tagIds;
    }

    return await transaction(this.dataSource.manager, async (tx) => {
      const entityManager = tx.entityManager;

      // Create the duplicated resource within the transaction
      const duplicatedResource = await this.create(
        userId,
        namespaceId,
        newResource,
        tx,
      );

      // Copy attachment relations to the duplicated resource within the same transaction
      await this.resourceAttachmentsService.copyAttachmentsToResource(
        resource.namespaceId,
        resource.id,
        duplicatedResource.id,
        entityManager,
      );
      return duplicatedResource;
    });
  }

  async permissionFilter<
    T extends string | Resource | PrivateSearchResourceDto,
  >(namespaceId: string, userId: string, resources: T[]): Promise<T[]> {
    const filtered: T[] = [];
    if (resources.length <= 0) {
      return filtered;
    }
    for (const res of resources) {
      const resourceId: string = typeof res === 'string' ? res : res.id;
      try {
        const hasPermission: boolean =
          await this.permissionsService.userHasPermission(
            namespaceId,
            resourceId,
            userId,
          );
        if (hasPermission) {
          filtered.push(res);
        }
      } catch {
        /* ignore error */
      }
    }
    return filtered;
  }

  async query(
    namespaceId: string,
    parentId: string,
    userId?: string, // if is undefined, would skip the permission filter
    tags?: string, // separated by `,`
  ): Promise<Resource[]> {
    let resourceIds: string[] = [];

    if (tags) {
      const tagsValue = tags.split(',').filter((tag) => tag.trim());
      if (tagsValue.length > 0) {
        resourceIds = await this.getResourceIdsByTagNames(
          namespaceId,
          tagsValue,
        );
        // If no resources match the tags, return empty array
        if (resourceIds.length === 0) {
          return [];
        }
      }
    }

    const where: FindOptionsWhere<Resource> = {
      namespaceId,
      parentId,
    };

    // If we have tag filtering, add resource ID constraint
    if (resourceIds.length > 0) {
      where.id = In(resourceIds);
    }

    const resources = await this.resourceRepository.find({
      where,
      select: [
        'id',
        'name',
        'attrs',
        'parentId',
        'createdAt',
        'updatedAt',
        'namespaceId',
        'resourceType',
        'tagIds',
      ],
    });

    // Load tags for all resources
    const tagsMap = await this.getTagsForResources(namespaceId, resources);

    const resourcesWithTags = resources.map((resource) => ({
      ...resource,
      tags: tagsMap.get(resource.id) || [],
    }));

    return userId
      ? await this.permissionFilter(namespaceId, userId, resourcesWithTags)
      : resourcesWithTags;
  }

  async move(
    namespaceId: string,
    resourceId: string,
    userId: string,
    targetId: string,
  ) {
    const ok = await this.permissionsService.userHasPermission(
      namespaceId,
      resourceId,
      userId,
    );
    if (!ok) {
      const message = this.i18n.t('auth.errors.notAuthorized');
      throw new AppException(message, 'NOT_AUTHORIZED', HttpStatus.FORBIDDEN);
    }
    await this.resourcesService.updateResource(
      namespaceId,
      resourceId,
      userId,
      { parentId: targetId },
    );
  }

  async search({ namespaceId, excludeResourceId, name, userId }) {
    const where: any = {
      userId,
      // Cannot move to root directory
      parentId: Not(IsNull()),
      namespaceId,
    };
    // Self and child exclusions
    if (excludeResourceId) {
      const resourceChildren = await this.getSubResourcesByUser(
        userId,
        namespaceId,
        excludeResourceId,
      );
      where.id = Not(
        In([
          excludeResourceId,
          ...resourceChildren.map((children) => children.id),
        ]),
      );
    }
    if (name) {
      where.name = Like(`%${name}%`);
    }
    const resources = await this.resourceRepository.find({
      where,
      skip: 0,
      take: 10,
      order: { updatedAt: 'DESC' },
    });
    const filteredResources = await this.permissionFilter(
      namespaceId,
      userId,
      resources,
    );
    return filteredResources.map((res) => ResourceMetaDto.fromEntity(res));
  }

  async recent(
    namespaceId: string,
    userId: string,
    limit: number = 10,
    offset: number = 0,
    options?: { summary?: boolean },
  ): Promise<SidebarChildDto[] | ResourceSummaryDto[]> {
    const { summary = false } = options || {};
    const allVisible = await this.getUserVisibleResources(userId, namespaceId);
    const sorted = allVisible
      .filter((r) => r.parentId !== null)
      .filter((r) => r.resourceType !== ResourceType.FOLDER)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    const take = Math.max(1, Math.min(100, limit));
    const skip = Math.max(0, offset);
    const paged = sorted.slice(skip, skip + take);

    // Fetch resources with or without content based on summary flag
    const resources = await this.resourcesService.getChildren(
      namespaceId,
      paged.map((r) => r.parentId!),
      { summary },
    );
    const resourceMap = new Map(resources.map((r) => [r.id, r]));

    // Get the final list of resources
    const finalResources = paged
      .map((r) => resourceMap.get(r.id))
      .filter((r): r is Resource => !!r);

    if (summary) {
      // Fetch first attachments only when summary is true
      const firstAttachments =
        await this.resourceAttachmentsService.getFirstAttachments(
          namespaceId,
          finalResources.map((r) => r.id),
        );

      // For recent api, hasChildren is always false
      return finalResources.map((r) =>
        ResourceSummaryDto.fromEntity(r, false, firstAttachments.get(r.id)),
      );
    }

    // For non-summary, return lightweight SidebarChildDto
    return finalResources.map((r) => SidebarChildDto.fromEntity(r, false));
  }

  // Alias for clarity and reuse across modules
  async getUserVisibleResources(
    userId: string,
    namespaceId: string,
  ): Promise<ResourceMetaDto[]> {
    return await this.getAllResourcesByUser(userId, namespaceId);
  }

  async getSubResourcesByUser(
    userId: string,
    namespaceId: string,
    resourceId: string,
  ): Promise<ResourceMetaDto[]> {
    const parents = await this.resourcesService.getParentResourcesOrFail(
      namespaceId,
      resourceId,
    );
    const subResources = await this.resourcesService.getSubResources(
      namespaceId,
      [resourceId],
    );
    const permissionMap = await this.permissionsService.getCurrentPermissions(
      userId,
      namespaceId,
      [...parents, ...subResources],
    );
    return subResources.filter((res) => {
      const permission = permissionMap.get(res.id);
      return (
        permission &&
        comparePermission(permission, ResourcePermission.CAN_VIEW) >= 0
      );
    });
  }

  async getAllSubResourcesByUser(
    userId: string,
    namespaceId: string,
    resourceId: string,
  ): Promise<ResourceMetaDto[]> {
    const parents = await this.resourcesService.getParentResourcesOrFail(
      namespaceId,
      resourceId,
    );
    const allSubResources = await this.resourcesService.getAllSubResources(
      namespaceId,
      [resourceId],
    );
    const permissionMap = await this.permissionsService.getCurrentPermissions(
      userId,
      namespaceId,
      [...parents, ...allSubResources],
    );
    return allSubResources.filter((res) => {
      const permission = permissionMap.get(res.id);
      return (
        permission &&
        comparePermission(permission, ResourcePermission.CAN_VIEW) >= 0
      );
    });
  }

  async hasChildren(
    userId: string,
    namespaceId: string,
    resourceId: string,
  ): Promise<boolean> {
    const children = await this.getSubResourcesByUser(
      userId,
      namespaceId,
      resourceId,
    );
    return children.length > 0;
  }

  async listChildren(
    namespaceId: string,
    resourceId: string,
    userId: string,
    options?: {
      summary?: boolean;
      limit?: number;
      offset?: number;
    },
  ): Promise<SidebarChildDto[] | ResourceSummaryDto[]> {
    const { summary = false, limit, offset } = options || {};

    const parents = await this.resourcesService.getParentResourcesOrFail(
      namespaceId,
      resourceId,
    );

    let children = await this.resourcesService.getChildren(
      namespaceId,
      [resourceId],
      { summary, limit, offset },
    );

    let subChildren = await this.resourcesService.getChildren(
      namespaceId,
      children.map((child) => child.id),
    );

    const allResources = [
      ...parents,
      ...children.map((r) => ResourceMetaDto.fromEntity(r)),
      ...subChildren.map((r) => ResourceMetaDto.fromEntity(r)),
    ];
    const permissionMap = await this.permissionsService.getCurrentPermissions(
      userId,
      namespaceId,
      allResources,
    );

    children = children.filter((res) => {
      const permission = permissionMap.get(res.id);
      return (
        permission &&
        comparePermission(permission, ResourcePermission.CAN_VIEW) >= 0
      );
    });

    subChildren = subChildren.filter((res) => {
      const permission = permissionMap.get(res.id);
      return (
        permission &&
        comparePermission(permission, ResourcePermission.CAN_VIEW) >= 0
      );
    });

    const hasChildrenMap = new Map<string, boolean>();
    for (const resource of subChildren) {
      if (resource.parentId) {
        hasChildrenMap.set(resource.parentId, true);
      }
    }

    if (summary) {
      const firstAttachments =
        await this.resourceAttachmentsService.getFirstAttachments(
          namespaceId,
          children.map((r) => r.id),
        );
      return children.map((res) =>
        ResourceSummaryDto.fromEntity(
          res,
          !!hasChildrenMap.get(res.id),
          firstAttachments.get(res.id),
        ),
      );
    }
    return children.map((res) =>
      SidebarChildDto.fromEntity(res, !!hasChildrenMap.get(res.id)),
    );
  }

  async getSpaceType(
    namespaceId: string,
    rootResourceId: string,
  ): Promise<SpaceType> {
    const count = await this.namespaceRepository.count({
      where: {
        id: namespaceId,
        rootResourceId: rootResourceId,
      },
    });
    return count > 0 ? SpaceType.TEAM : SpaceType.PRIVATE;
  }

  async getResource({
    userId,
    namespaceId,
    resourceId,
  }: {
    userId: string;
    namespaceId: string;
    resourceId: string;
  }): Promise<ResourceDto> {
    const resource = await this.resourcesService.getResourceOrFail(
      namespaceId,
      resourceId,
    );
    if (!resource.parentId) {
      const message = this.i18n.t('resource.errors.resourceNotFound');
      throw new AppException(
        message,
        'RESOURCE_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
    const parentResources =
      await this.resourcesService.getParentResourcesOrFail(
        namespaceId,
        resource.parentId,
      );

    const rootResourceId = parentResources[parentResources.length - 1].id;
    const spaceType = await this.getSpaceType(namespaceId, rootResourceId);

    const resourceMeta = ResourceMetaDto.fromEntity(resource);
    const curPermission = await this.permissionsService.getCurrentPermission(
      namespaceId,
      [resourceMeta, ...parentResources],
      userId,
    );

    if (curPermission === ResourcePermission.NO_ACCESS) {
      const message = this.i18n.t('auth.errors.notAuthorized');
      throw new AppException(message, 'NOT_AUTHORIZED', HttpStatus.FORBIDDEN);
    }

    // Load tags of the resource
    const tagsMap = await this.getTagsForResources(namespaceId, [resource]);
    const path = [resourceMeta, ...parentResources]
      .reverse()
      .map((r) => ({ id: r.id, name: r.name }));
    return ResourceDto.fromEntity(
      resource,
      curPermission,
      path,
      spaceType,
      tagsMap.get(resource.id) || [],
    );
  }

  async getResourceFileForUser(
    userId: string,
    namespaceId: string,
    resourceId: string,
  ): Promise<DownloadFileInfoDto> {
    const ok = await this.permissionsService.userHasPermission(
      namespaceId,
      resourceId,
      userId,
    );
    if (!ok) {
      const message = this.i18n.t('auth.errors.notAuthorized');
      throw new AppException(message, 'NOT_AUTHORIZED', HttpStatus.FORBIDDEN);
    }
    const resource = await this.resourcesService.getResourceMetaOrFail(
      namespaceId,
      resourceId,
    );
    if (resource.resourceType !== ResourceType.FILE) {
      const message = this.i18n.t('resource.errors.fileNotFound');
      throw new AppException(message, 'FILE_NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    if (!resource.fileId) {
      const disposition = `attachment; filename*=UTF-8''${encodeURIComponent(resource.name)}`;
      const url = await this.s3Service.generateDownloadUrl(
        this.s3Path(resource.id),
        true,
        disposition,
      );
      return DownloadFileInfoDto.new(url);
    }
    const url = await this.filesService.generateDownloadUrl(
      namespaceId,
      resource.fileId,
      true,
    );
    return DownloadFileInfoDto.new(url);
  }

  async getResourceFileForInternal(
    namespaceId: string,
    resourceId: string,
  ): Promise<InternalFileInfoDto> {
    const resource = await this.resourcesService.getResourceMetaOrFail(
      namespaceId,
      resourceId,
    );
    if (resource.resourceType !== ResourceType.FILE || !resource.fileId) {
      const message = this.i18n.t('resource.errors.fileNotFound');
      throw new AppException(message, 'FILE_NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    const publicUrl = await this.filesService.generateDownloadUrl(
      namespaceId,
      resource.fileId,
      true,
    );
    const internalUrl = await this.filesService.generateDownloadUrl(
      namespaceId,
      resource.fileId,
      false,
    );
    return InternalFileInfoDto.new(publicUrl, internalUrl);
  }

  async getResourcesForInternal(
    namespaceId: string,
    resourceIds: string[],
    createdAtBefore?: Date,
    createdAtAfter?: Date,
    userId?: string,
    parentId?: string,
    tags?: string[],
  ): Promise<InternalResourceDto[]> {
    let tagIds: string[] | undefined;
    if (tags && tags.length > 0) {
      const tagEntities = await this.tagService.findByNames(namespaceId, tags);
      tagIds = tagEntities.map((t) => t.id);
      if (tagIds.length === 0) {
        return [];
      }
    }

    const resources = await this.resourcesService.batchGetResources(
      namespaceId,
      resourceIds,
      createdAtBefore,
      createdAtAfter,
      userId,
      parentId,
      tagIds,
    );

    // Populate tags for resources
    const tagsMap = await this.getTagsForResources(namespaceId, resources);

    // Get paths for each resource
    const result: InternalResourceDto[] = [];
    for (const resource of resources) {
      let path: ResourceMetaDto[] = [];
      if (resource.parentId) {
        const parentResources =
          await this.resourcesService.getParentResourcesOrFail(
            namespaceId,
            resource.parentId,
          );
        path = parentResources.reverse();
      }

      result.push(
        InternalResourceDto.fromEntity(
          resource,
          path,
          tagsMap.get(resource.id) || [],
        ),
      );
    }

    return result;
  }

  async getResourceChildrenForInternal(
    namespaceId: string,
    resourceId: string,
    depth: number,
  ): Promise<ResourceMetaDto[]> {
    if (depth < 1 || depth > 3) {
      throw new AppException(
        'Depth must be between 1 and 3',
        'INVALID_DEPTH',
        HttpStatus.BAD_REQUEST,
      );
    }
    const allChildren: ResourceMetaDto[] = [];
    let resourceIds = [resourceId];
    for (let currentDepth = 0; currentDepth < depth; currentDepth++) {
      const children = await this.resourcesService.getSubResources(
        namespaceId,
        resourceIds,
      );
      if (children.length === 0) {
        break;
      }
      allChildren.push(...children);
      resourceIds = children.map((child) => child.id);
    }
    return allChildren;
  }

  async createResourceFile(
    userId: string,
    namespaceId: string,
    createReq: CreateFileReqDto,
  ) {
    const ok = await this.permissionsService.userInNamespace(
      userId,
      namespaceId,
    );
    if (!ok) {
      const message = this.i18n.t('auth.errors.notAuthorized');
      throw new AppException(message, 'NOT_AUTHORIZED', HttpStatus.FORBIDDEN);
    }
    return await this.filesService.createFile(
      userId,
      namespaceId,
      createReq.name,
      createReq.mimetype,
    );
  }

  async createFileUploadForm(
    userId: string,
    namespaceId: string,
    createReq: CreateFileReqDto,
  ): Promise<UploadFileInfoDto> {
    const file = await this.createResourceFile(userId, namespaceId, createReq);
    const postReq = await this.filesService.generateUploadForm(
      file.id,
      createReq.size,
      file.name,
    );
    return UploadFileInfoDto.new(file.id, postReq.url, postReq.fields);
  }

  async update(userId: string, resourceId: string, data: UpdateResourceDto) {
    await this.resourcesService.updateResource(
      data.namespaceId,
      resourceId,
      userId,
      {
        name: data.name,
        tagIds: data.tag_ids,
        content: data.content,
        attrs: data.attrs,
      },
    );
  }

  async delete(userId: string, namespaceId: string, id: string) {
    const resource = await this.resourcesService.getResourceOrFail(
      namespaceId,
      id,
    );
    if (!resource.parentId) {
      const message = this.i18n.t('resource.errors.cannotDeleteRoot');
      throw new AppException(
        message,
        'CANNOT_DELETE_ROOT',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.resourcesService.deleteResource(userId, namespaceId, id);
  }

  async restore(userId: string, namespaceId: string, resourceId: string) {
    const resource = await this.resourceRepository.findOne({
      withDeleted: true,
      where: {
        namespaceId,
        id: resourceId,
      },
    });
    if (!resource) {
      const message = this.i18n.t('resource.errors.resourceNotFound');
      throw new AppException(
        message,
        'RESOURCE_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
    if (resource.parentId === null) {
      const message = this.i18n.t('resource.errors.cannotRestoreRoot');
      throw new AppException(
        message,
        'CANNOT_RESTORE_ROOT',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Check if parent is deleted, if so restore to root
    const isParentDeleted = await this.resourcesService.isParentDeleted(
      namespaceId,
      resource.parentId,
    );

    if (isParentDeleted) {
      // Find user's root resource to restore to
      const userRoot = resource.userId
        ? await this.resourceRepository.findOne({
            where: {
              namespaceId,
              userId: resource.userId,
              parentId: IsNull(),
            },
          })
        : null;

      if (userRoot) {
        // Update parentId to user's root before restoring
        await this.resourceRepository.update(
          { id: resourceId },
          { parentId: userRoot.id },
        );
      }
    }

    await this.resourcesService.restoreResource(
      userId,
      namespaceId,
      resourceId,
    );
  }

  s3Path(resourceId: string) {
    return `resources/${resourceId}`;
  }

  async uploadFile(
    userId: string,
    namespaceId: string,
    file: Express.Multer.File,
    parentId: string,
    source?: string,
    parsedContent?: string,
  ) {
    const originalFilename = getOriginalFileName(file.originalname);
    const resourceFile = await this.createResourceFile(userId, namespaceId, {
      name: originalFilename,
      mimetype: file.mimetype,
    });
    await this.filesService.uploadFile(resourceFile, file.buffer);
    return await this.create(
      userId,
      namespaceId,
      {
        parentId,
        resourceType: ResourceType.FILE,
        name: originalFilename,
        file_id: resourceFile.id,
        content: parsedContent,
      },
      undefined,
      source,
    );
  }

  async getAllResourcesByUser(
    userId: string,
    namespaceId: string,
    includeRoot: boolean = false,
  ): Promise<ResourceMetaDto[]> {
    const resources = await this.permissionsService.filterResourcesByPermission(
      userId,
      namespaceId,
      await this.resourcesService.getAllResources(namespaceId),
    );
    return resources.filter((res) => res.parentId !== null || includeRoot);
  }

  async listAllResources(offset: number, limit: number) {
    return await this.resourceRepository.find({
      skip: offset,
      take: limit,
    });
  }

  async listTrash(
    namespaceId: string,
    userId: string,
    options?: {
      search?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<TrashListResponseDto> {
    const { search, limit = 20, offset = 0 } = options || {};

    // Check if user has access to this namespace
    const hasAccess = await this.permissionsService.userInNamespace(
      userId,
      namespaceId,
    );
    if (!hasAccess) {
      const message = this.i18n.t('auth.errors.notAuthorized');
      throw new AppException(message, 'NOT_AUTHORIZED', HttpStatus.FORBIDDEN);
    }

    const { items, total } = await this.resourcesService.getDeletedResources(
      namespaceId,
      { search, limit, offset },
    );

    const trashItems = items.map((resource) =>
      TrashItemDto.fromEntity(resource, false),
    );

    return TrashListResponseDto.create(trashItems, total, limit, offset);
  }

  async permanentlyDeleteResource(
    userId: string,
    namespaceId: string,
    resourceId: string,
  ): Promise<void> {
    // Check if user has access to this namespace
    const hasAccess = await this.permissionsService.userInNamespace(
      userId,
      namespaceId,
    );
    if (!hasAccess) {
      const message = this.i18n.t('auth.errors.notAuthorized');
      throw new AppException(message, 'NOT_AUTHORIZED', HttpStatus.FORBIDDEN);
    }

    await this.resourcesService.hardDeleteResource(namespaceId, resourceId);
  }

  async emptyTrash(
    userId: string,
    namespaceId: string,
  ): Promise<{ deleted_count: number }> {
    // Check if user has access to this namespace
    const hasAccess = await this.permissionsService.userInNamespace(
      userId,
      namespaceId,
    );
    if (!hasAccess) {
      const message = this.i18n.t('auth.errors.notAuthorized');
      throw new AppException(message, 'NOT_AUTHORIZED', HttpStatus.FORBIDDEN);
    }

    const deletedCount =
      await this.resourcesService.hardDeleteAllTrash(namespaceId);

    return { deleted_count: deletedCount };
  }
}
