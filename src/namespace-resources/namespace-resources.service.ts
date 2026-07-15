import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { FilesService } from 'omniboxd/files/files.service';
import { CreateResourceDto } from 'omniboxd/namespace-resources/dto/create-resource.dto';
import { UpdateResourceDto } from 'omniboxd/namespace-resources/dto/update-resource.dto';
import { Namespace } from 'omniboxd/namespaces/entities/namespace.entity';
import { NamespacesQuotaService } from 'omniboxd/namespaces/namespaces-quota.service';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import {
  comparePermission,
  ResourcePermission,
} from 'omniboxd/permissions/resource-permission.enum';
import { ResourceAttachmentsService } from 'omniboxd/resource-attachments/resource-attachments.service';
import { ResourceMetaDto } from 'omniboxd/resources/dto/resource-meta.dto';
import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { S3Service } from 'omniboxd/s3/s3.service';
import {
  ISmartFoldersService,
  SMART_FOLDERS_SERVICE,
} from 'omniboxd/smart-folders/smart-folder-entitlements.interface';
import { TagDto } from 'omniboxd/tag/dto/tag.dto';
import { TagService } from 'omniboxd/tag/tag.service';
import duplicateName from 'omniboxd/utils/duplicate-name';
import { getOriginalFileName } from 'omniboxd/utils/encode-filename';
import { isOptional } from 'omniboxd/utils/is-empty';
import { Transaction, transaction } from 'omniboxd/utils/transaction-utils';
import { PrivateSearchResourceDto } from 'omniboxd/wizard/dto/agent-request.dto';
import {
  DataSource,
  EntityManager,
  FindOptionsWhere,
  In,
  IsNull,
  Like,
  Not,
  Repository,
} from 'typeorm';

import { BatchCreateFolderDto } from './dto/batch-resource-actions.dto';
import { CreateFileReqDto } from './dto/create-file-req.dto';
import {
  DownloadFileInfoDto,
  InternalFileInfoDto,
  UploadFileInfoDto,
} from './dto/file-info.dto';
import { InternalResourceDto } from './dto/internal-resource.dto';
import { ResourceDto, SpaceType } from './dto/resource.dto';
import { ResourceSummaryDto } from './dto/resource-summary.dto';
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
    private readonly namespacesQuotaService: NamespacesQuotaService,
    @Inject(SMART_FOLDERS_SERVICE)
    private readonly smartFoldersService: ISmartFoldersService,
  ) {}

  private async getTagsByIds(
    namespaceId: string,
    tagIds: string[],
  ): Promise<TagDto[]> {
    return await this.tagService.getTagsByIds(namespaceId, tagIds);
  }

  async getTagsForResources(
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

  async getResourceMetaByTags(
    namespaceId: string,
    userId: string,
    tagIds: string[],
  ): Promise<ResourceMetaDto[]> {
    if (tagIds.length === 0) {
      return [];
    }

    const resources = await this.resourceRepository
      .createQueryBuilder('resource')
      .where('resource.namespace_id = :namespaceId', { namespaceId })
      .andWhere('resource.parent_id IS NOT NULL')
      .andWhere('resource.resource_type NOT IN (:...resourceTypes)', {
        resourceTypes: [ResourceType.FOLDER, ResourceType.SMART_FOLDER],
      })
      .andWhere('resource.tag_ids && :tagIds', { tagIds })
      .getMany();

    const resourceMetaMap = await this.resourcesService.batchGetParentResources(
      namespaceId,
      resources.map((resource) => resource.id),
    );
    const permissionMap = await this.permissionsService.getCurrentPermissions(
      userId,
      namespaceId,
      [...resourceMetaMap.values()],
    );
    return resources
      .filter((resource) => {
        const permission = permissionMap.get(resource.id);
        return (
          permission &&
          comparePermission(permission, ResourcePermission.CAN_VIEW) >= 0
        );
      })
      .map((resource) => ResourceMetaDto.fromEntity(resource));
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
    autoRenameOnConflict: boolean = false,
  ): Promise<Resource> {
    if (!tx) {
      return await transaction(this.dataSource.manager, async (tx) => {
        return await this.create(
          userId,
          namespaceId,
          createReq,
          tx,
          source,
          autoRenameOnConflict,
        );
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
      autoRenameOnConflict,
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
        userId,
        tx,
      );
      return duplicatedResource;
    });
  }

  async permissionFilter<
    T extends string | Resource | PrivateSearchResourceDto,
  >(namespaceId: string, userId: string, resources: T[]): Promise<T[]> {
    if (resources.length <= 0) {
      return [];
    }

    const resourceIds = [
      ...new Set(
        resources.map((resource) =>
          typeof resource === 'string' ? resource : resource.id,
        ),
      ),
    ];
    const resourceMetaMap = await this.resourcesService.batchGetParentResources(
      namespaceId,
      resourceIds,
    );
    const permissionMap = await this.permissionsService.getCurrentPermissions(
      userId,
      namespaceId,
      [...resourceMetaMap.values()],
    );

    return resources.filter((resource) => {
      const resourceId = typeof resource === 'string' ? resource : resource.id;
      const permission = permissionMap.get(resourceId);
      return (
        permission &&
        comparePermission(permission, ResourcePermission.CAN_VIEW) >= 0
      );
    });
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
    const canEditResource = await this.permissionsService.userHasPermission(
      namespaceId,
      resourceId,
      userId,
      ResourcePermission.CAN_EDIT,
    );
    if (!canEditResource) {
      const message = this.i18n.t('auth.errors.notAuthorized');
      throw new AppException(message, 'NOT_AUTHORIZED', HttpStatus.FORBIDDEN);
    }

    const canEditTarget = await this.permissionsService.userHasPermission(
      namespaceId,
      targetId,
      userId,
      ResourcePermission.CAN_EDIT,
    );
    if (!canEditTarget) {
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

  private async getEditableResourceIds(
    namespaceId: string,
    userId: string,
    resourceIds: string[],
    manager: EntityManager,
  ): Promise<Set<string>> {
    const userInNamespace = await this.permissionsService.userInNamespace(
      userId,
      namespaceId,
      manager,
    );
    if (!userInNamespace) {
      const message = this.i18n.t('auth.errors.notAuthorized');
      throw new AppException(message, 'NOT_AUTHORIZED', HttpStatus.FORBIDDEN);
    }
    const parents = await this.resourcesService.batchGetParentResources(
      namespaceId,
      resourceIds,
      manager,
    );
    const editableResources =
      await this.permissionsService.filterResourcesByPermission(
        userId,
        namespaceId,
        [...parents.values()],
        ResourcePermission.CAN_EDIT,
        manager,
      );
    const editableResourceIds = new Set(
      editableResources.map((resource) => resource.id),
    );
    const editableIds = new Set<string>();
    for (const resourceId of resourceIds) {
      const resource = parents.get(resourceId);
      if (resource?.parentId && editableResourceIds.has(resourceId)) {
        editableIds.add(resourceId);
      }
    }
    return editableIds;
  }

  async batchMoveToTrash(
    userId: string,
    namespaceId: string,
    resourceIds: string[],
  ): Promise<{
    successIds: string[];
    failedIds: string[];
  }> {
    return await transaction(this.dataSource.manager, async (tx) => {
      const batchResourceIds = await this.getBatchTopLevelResourceIds(
        namespaceId,
        resourceIds,
        tx.entityManager,
      );
      const editableIds = await this.getEditableResourceIds(
        namespaceId,
        userId,
        batchResourceIds,
        tx.entityManager,
      );
      const deleteIds = batchResourceIds.filter((id) => editableIds.has(id));
      if (deleteIds.length === 0) {
        return {
          successIds: [],
          failedIds: batchResourceIds,
        };
      }
      const deletedIds = await this.resourcesService.batchDeleteResources(
        userId,
        namespaceId,
        deleteIds,
        tx,
      );
      const successIds = batchResourceIds.filter((id) =>
        deletedIds.includes(id),
      );
      return {
        successIds: successIds,
        failedIds: batchResourceIds.filter((id) => !successIds.includes(id)),
      };
    });
  }

  async assertCanBatchMoveToTrash(
    userId: string,
    namespaceId: string,
    resourceIds: string[],
  ): Promise<void> {
    const manager = this.dataSource.manager;
    const batchResourceIds = await this.getBatchTopLevelResourceIds(
      namespaceId,
      resourceIds,
      manager,
    );
    const editableIds = await this.getEditableResourceIds(
      namespaceId,
      userId,
      batchResourceIds,
      manager,
    );
    if (batchResourceIds.some((id) => !editableIds.has(id))) {
      const message = this.i18n.t('auth.errors.notAuthorized');
      throw new AppException(message, 'NOT_AUTHORIZED', HttpStatus.FORBIDDEN);
    }
  }

  async batchMove(
    userId: string,
    namespaceId: string,
    resourceIds: string[],
    targetId: string,
  ): Promise<{
    successIds: string[];
    failedIds: string[];
    nameConflictIds: string[];
  }> {
    return await transaction(this.dataSource.manager, async (tx) => {
      const batchResourceIds = await this.getBatchTopLevelResourceIds(
        namespaceId,
        resourceIds,
        tx.entityManager,
      );
      const userHasPermission = await this.permissionsService.userHasPermission(
        namespaceId,
        targetId,
        userId,
        ResourcePermission.CAN_EDIT,
        undefined,
        tx.entityManager,
      );
      if (!userHasPermission) {
        const message = this.i18n.t('auth.errors.notAuthorized');
        throw new AppException(
          message,
          'TARGET_NOT_EDITABLE',
          HttpStatus.FORBIDDEN,
        );
      }
      const editableIds = await this.getEditableResourceIds(
        namespaceId,
        userId,
        batchResourceIds,
        tx.entityManager,
      );
      const moveIds = batchResourceIds.filter((id) => editableIds.has(id));
      if (moveIds.length === 0) {
        const message = this.i18n.t('auth.errors.notAuthorized');
        throw new AppException(
          message,
          'BATCH_SOURCE_NOT_EDITABLE',
          HttpStatus.FORBIDDEN,
        );
      }
      const { movedIds, nameConflictIds } =
        await this.resourcesService.batchMoveResources(
          userId,
          namespaceId,
          moveIds,
          targetId,
          tx,
        );
      const successIds = batchResourceIds.filter((id) => movedIds.includes(id));
      return {
        successIds: successIds,
        failedIds: batchResourceIds.filter((id) => !successIds.includes(id)),
        nameConflictIds,
      };
    });
  }

  async batchCreateFolder(
    userId: string,
    namespaceId: string,
    data: BatchCreateFolderDto,
  ): Promise<{
    resource: Resource | null;
    successIds: string[];
    failedIds: string[];
    nameConflictIds: string[];
  }> {
    return await transaction(this.dataSource.manager, async (tx) => {
      const batchResourceIds = await this.getBatchTopLevelResourceIds(
        namespaceId,
        data.resourceIds,
        tx.entityManager,
      );
      const userHasPermission = await this.permissionsService.userHasPermission(
        namespaceId,
        data.parentId,
        userId,
        ResourcePermission.CAN_EDIT,
        undefined,
        tx.entityManager,
      );
      if (!userHasPermission) {
        const target = await tx.entityManager
          .getRepository(Resource)
          .findOne({ where: { namespaceId, id: data.parentId } });
        const message = this.i18n.t('auth.errors.notAuthorized');
        throw new AppException(
          message,
          'TARGET_NOT_EDITABLE',
          HttpStatus.FORBIDDEN,
          { target_name: target?.name },
        );
      }
      await this.ensureResourceNameNotExists(
        namespaceId,
        data.parentId,
        data.name,
        tx.entityManager,
      );
      const editableIds = await this.getEditableResourceIds(
        namespaceId,
        userId,
        batchResourceIds,
        tx.entityManager,
      );
      const moveIds = batchResourceIds.filter((id) => editableIds.has(id));
      if (moveIds.length === 0) {
        return {
          resource: null,
          successIds: [],
          failedIds: batchResourceIds,
          nameConflictIds: [],
        };
      }

      const folder = await this.create(
        userId,
        namespaceId,
        {
          name: data.name,
          parentId: data.parentId,
          resourceType: ResourceType.FOLDER,
        },
        tx,
      );
      const { movedIds, nameConflictIds } =
        await this.resourcesService.batchMoveResources(
          userId,
          namespaceId,
          moveIds,
          folder.id,
          tx,
        );
      const successIds = batchResourceIds.filter((id) => movedIds.includes(id));
      return {
        resource: folder,
        successIds: successIds,
        failedIds: batchResourceIds.filter((id) => !successIds.includes(id)),
        nameConflictIds,
      };
    });
  }

  private async getBatchTopLevelResourceIds(
    namespaceId: string,
    resourceIds: string[],
    entityManager: EntityManager,
  ): Promise<string[]> {
    if (resourceIds.length === 0) {
      return [];
    }
    const resourceIdSet = new Set(resourceIds);
    const resourcesById = await this.resourcesService.batchGetParentResources(
      namespaceId,
      resourceIds,
      entityManager,
    );
    return resourceIds.filter((id) => {
      let current = resourcesById.get(id);
      while (current?.parentId) {
        if (resourceIdSet.has(current.parentId)) {
          return false;
        }
        current = resourcesById.get(current.parentId);
      }
      return true;
    });
  }

  private async ensureResourceNameNotExists(
    namespaceId: string,
    parentId: string,
    name: string,
    entityManager: EntityManager,
  ): Promise<void> {
    const count = await entityManager
      .getRepository(Resource)
      .createQueryBuilder('resource')
      .where('resource.namespace_id = :namespaceId', { namespaceId })
      .andWhere('resource.parent_id IS NOT DISTINCT FROM :parentId', {
        parentId,
      })
      .andWhere('LOWER(resource.name) = LOWER(:name)', { name })
      .andWhere('resource.deleted_at IS NULL')
      .getCount();
    if (count > 0) {
      const message = this.i18n.t('resource.errors.resourceNameConflict');
      throw new AppException(
        message,
        'RESOURCE_NAME_CONFLICT',
        HttpStatus.CONFLICT,
      );
    }
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
  ): Promise<ResourceSummaryDto[]> {
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

    // For non-summary, return lightweight ResourceSummaryDto
    return finalResources.map((r) => ResourceSummaryDto.fromEntity(r, false));
  }

  async getRecentResources(
    namespaceId: string,
    userId: string,
    count: number,
  ): Promise<Resource[]> {
    const result: Resource[] = [];
    const batchSize = 100;
    for (let skip = 0; ; skip += batchSize) {
      const batch = await this.resourceRepository.find({
        where: {
          namespaceId,
          parentId: Not(IsNull()),
          resourceType: Not(
            In([ResourceType.FOLDER, ResourceType.SMART_FOLDER]),
          ),
        },
        order: { updatedAt: 'DESC' },
        take: batchSize,
        skip,
      });
      if (batch.length === 0) {
        return result;
      }

      // filterResourcesByPermission needs each resource's ancestors present to
      // resolve inherited permissions, so expand the batch to include them.
      const withParents = await this.resourcesService.batchGetParentResources(
        namespaceId,
        batch.map((r) => r.id),
      );
      const visible = await this.permissionsService.filterResourcesByPermission(
        userId,
        namespaceId,
        [...withParents.values()],
      );
      const visibleIds = new Set(visible.map((r) => r.id));

      for (const resource of batch) {
        if (visibleIds.has(resource.id)) {
          result.push(resource);
          if (result.length >= count) {
            return result;
          }
        }
      }

      if (batch.length < batchSize) {
        return result;
      }
    }
  }

  // Staleness signal only — intentionally not permission-filtered.
  async getLastUpdatedAt(namespaceId: string): Promise<Date | undefined> {
    const resource = await this.resourceRepository.findOne({
      select: ['updatedAt'],
      where: {
        namespaceId,
        parentId: Not(IsNull()),
        resourceType: Not(In([ResourceType.FOLDER, ResourceType.SMART_FOLDER])),
      },
      order: { updatedAt: 'DESC' },
    });
    return resource?.updatedAt;
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
    const children = await this.resourcesService.getChildren(namespaceId, [
      resourceId,
    ]);
    const subResources = children.map((r) => ResourceMetaDto.fromEntity(r));
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
    entityManager?: EntityManager,
  ): Promise<ResourceSummaryDto[]> {
    const { summary = false, limit, offset } = options || {};

    const parents = await this.resourcesService.getParentResourcesOrFail(
      namespaceId,
      resourceId,
      entityManager,
    );
    // getParentResourcesOrFail returns the chain target-first ([target, ..., root]),
    // so the target resource (which may be a smart folder) is parents[0].
    const resource = parents[0];

    if (resource?.resourceType === ResourceType.SMART_FOLDER) {
      return await this.smartFoldersService.listChildren(
        userId,
        namespaceId,
        resourceId,
        {
          limit,
          offset,
        },
      );
    }

    let children = await this.resourcesService.getChildren(
      namespaceId,
      [resourceId],
      { summary, limit, offset },
      entityManager,
    );

    let subChildren = await this.resourcesService.getChildren(
      namespaceId,
      children.map((child) => child.id),
      {},
      entityManager,
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
      entityManager,
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
      ResourceSummaryDto.fromEntity(res, !!hasChildrenMap.get(res.id)),
    );
  }

  async listChildrenWithTotal(
    namespaceId: string,
    resourceId: string,
    userId: string,
    options?: {
      summary?: boolean;
      limit?: number;
      offset?: number;
    },
    entityManager?: EntityManager,
  ): Promise<{ resources: ResourceSummaryDto[]; total: number }> {
    const { summary = false, limit, offset } = options || {};

    const parents = await this.resourcesService.getParentResourcesOrFail(
      namespaceId,
      resourceId,
      entityManager,
    );
    // getParentResourcesOrFail returns the chain target-first ([target, ..., root]),
    // so the target resource (which may be a smart folder) is parents[0].
    const resource = parents[0];

    if (resource?.resourceType === ResourceType.SMART_FOLDER) {
      return await this.smartFoldersService.listChildrenWithTotal(
        userId,
        namespaceId,
        resourceId,
        {
          limit,
          offset,
        },
      );
    }

    const children = await this.resourcesService.getChildren(
      namespaceId,
      [resourceId],
      { summary },
      entityManager,
    );

    const permissionMap = await this.permissionsService.getCurrentPermissions(
      userId,
      namespaceId,
      [...parents, ...children.map((r) => ResourceMetaDto.fromEntity(r))],
      entityManager,
    );

    const visibleChildren = children.filter((res) => {
      const permission = permissionMap.get(res.id);
      return (
        permission &&
        comparePermission(permission, ResourcePermission.CAN_VIEW) >= 0
      );
    });

    const total = visibleChildren.length;
    const normalizedOffset = Math.max(0, offset ?? 0);
    const normalizedLimit =
      limit === undefined ? undefined : Math.max(1, limit);
    const pagedChildren =
      normalizedLimit === undefined
        ? visibleChildren.slice(normalizedOffset)
        : visibleChildren.slice(
            normalizedOffset,
            normalizedOffset + normalizedLimit,
          );

    let subChildren = await this.resourcesService.getChildren(
      namespaceId,
      pagedChildren.map((child) => child.id),
      {},
      entityManager,
    );

    const subChildrenPermissionMap =
      await this.permissionsService.getCurrentPermissions(
        userId,
        namespaceId,
        [
          ...parents,
          ...pagedChildren.map((r) => ResourceMetaDto.fromEntity(r)),
          ...subChildren.map((r) => ResourceMetaDto.fromEntity(r)),
        ],
        entityManager,
      );

    subChildren = subChildren.filter((res) => {
      const permission = subChildrenPermissionMap.get(res.id);
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
          pagedChildren.map((r) => r.id),
        );
      return {
        resources: pagedChildren.map((res) =>
          ResourceSummaryDto.fromEntity(
            res,
            !!hasChildrenMap.get(res.id),
            firstAttachments.get(res.id),
          ),
        ),
        total,
      };
    }
    return {
      resources: pagedChildren.map((res) =>
        ResourceSummaryDto.fromEntity(res, !!hasChildrenMap.get(res.id)),
      ),
      total,
    };
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

  async BatchResourceToInternalResourceDto(
    namespaceId: string,
    resources: Resource[],
  ): Promise<InternalResourceDto[]> {
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

  async resourceFilter(
    namespaceId: string,
    resourceIds: string[],
    options?: {
      createdAtBefore?: Date;
      createdAtAfter?: Date;
      updatedAtBefore?: Date;
      updatedAtAfter?: Date;
      tagPattern?: string;
      namePattern?: string;
      contentPattern?: string;
      urlPattern?: string;
      userId?: string;
      parentId?: string;
      resourceTypes?: ResourceType[];
      offset?: number;
      limit?: number;
    },
  ): Promise<{ resources: InternalResourceDto[]; total: number }> {
    let tagIds: string[] | undefined = undefined;
    if (!isOptional(options?.tagPattern)) {
      const tagEntities = await this.tagService.findByPattern(
        namespaceId,
        options.tagPattern,
      );
      tagIds = tagEntities.map((t) => t.id);
    }
    const { resources, total } = await this.resourcesService.resourceFilter(
      namespaceId,
      resourceIds,
      { ...options, tagIds },
    );

    const result: InternalResourceDto[] =
      await this.BatchResourceToInternalResourceDto(namespaceId, resources);

    return { resources: result, total };
  }

  async batchGetResourceInternalDto(
    namespaceId: string,
    userId: string,
    resourceIds: string[],
  ): Promise<InternalResourceDto[]> {
    const filteredResourceIds: string[] = await this.permissionFilter(
      namespaceId,
      userId,
      resourceIds,
    );

    const resources = await this.resourcesService.batchGetResources(
      namespaceId,
      filteredResourceIds,
    );

    return await this.BatchResourceToInternalResourceDto(
      namespaceId,
      resources,
    );
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
      const children = await this.resourcesService.getChildren(
        namespaceId,
        resourceIds,
      );
      if (children.length === 0) {
        break;
      }
      const childMetas = children.map((r) => ResourceMetaDto.fromEntity(r));
      allChildren.push(...childMetas);
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
      createReq.size,
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

  async update(
    namespaceId: string,
    userId: string,
    resourceId: string,
    data: UpdateResourceDto,
    autoRenameOnConflict: boolean = false,
  ) {
    if (data.parentId) {
      await this.resourcesService.getResourceOrFail(namespaceId, data.parentId);
      await this.permissionsService.userHasPermissionOrFail(
        namespaceId,
        data.parentId,
        userId,
        ResourcePermission.CAN_EDIT,
      );
    }
    await this.resourcesService.updateResource(
      namespaceId,
      resourceId,
      userId,
      {
        name: data.name,
        tagIds: data.tag_ids,
        content: data.content,
        attrs: data.attrs,
        parentId: data.parentId,
      },
      undefined,
      autoRenameOnConflict,
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

    // Check smart folder quota before restoring
    if (resource.resourceType === ResourceType.SMART_FOLDER) {
      await this.smartFoldersService.assertRestoreEntitlements(
        namespaceId,
        userId,
        resourceId,
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

    // Check for name conflict under the target parent
    {
      // Re-read resource to get the updated parentId
      const updatedResource = await this.resourceRepository.findOne({
        withDeleted: true,
        where: { namespaceId, id: resourceId },
      });
      const targetParentId = updatedResource?.parentId ?? resource.parentId;
      const conflictCount = await this.resourceRepository
        .createQueryBuilder('resource')
        .where('resource.namespace_id = :namespaceId', { namespaceId })
        .andWhere('resource.parent_id IS NOT DISTINCT FROM :parentId', {
          parentId: targetParentId,
        })
        .andWhere('LOWER(resource.name) = LOWER(:name)', {
          name: resource.name,
        })
        .andWhere('resource.deleted_at IS NULL')
        .andWhere('resource.id != :resourceId', { resourceId })
        .getCount();
      if (conflictCount > 0) {
        const message = this.i18n.t('resource.errors.resourceNameConflict');
        throw new AppException(
          message,
          'RESOURCE_NAME_CONFLICT',
          HttpStatus.CONFLICT,
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
      size: file.buffer.length,
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
      true, // autoRenameOnConflict for file uploads
    );
  }

  async getAllResourcesByUser(
    userId: string,
    namespaceId: string,
    includeRoot: boolean = false,
    requiredPermission: ResourcePermission = ResourcePermission.CAN_VIEW,
  ): Promise<ResourceMetaDto[]> {
    const allResources =
      await this.resourcesService.getAllResources(namespaceId);
    const resources = await this.permissionsService.filterResourcesByPermission(
      userId,
      namespaceId,
      allResources,
      requiredPermission,
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

    const usage =
      await this.namespacesQuotaService.getNamespaceUsage(namespaceId);

    const { items, total } = await this.resourcesService.getDeletedResources(
      namespaceId,
      usage.trashRetentionDays,
      { search },
    );

    const resourceMetaMap = await this.resourcesService.batchGetParentResources(
      namespaceId,
      items.map((resource) => resource.id),
      undefined,
      true,
    );

    const permissionMap = await this.permissionsService.getCurrentPermissions(
      userId,
      namespaceId,
      [...resourceMetaMap.values()],
    );

    const filteredItems = items
      .filter((resource) => {
        const permission = permissionMap.get(resource.id);
        return (
          permission &&
          comparePermission(permission, ResourcePermission.CAN_EDIT) >= 0
        );
      })
      .slice(offset, offset + limit);

    const trashItems = filteredItems.map((resource) =>
      TrashItemDto.fromEntity(resource, false),
    );

    return TrashListResponseDto.create(
      trashItems,
      total,
      limit,
      offset,
      usage.trashRetentionDays,
    );
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

    // Fetch all trash items
    const trashItems = await this.resourceRepository.find({
      withDeleted: true,
      where: {
        namespaceId,
        deletedAt: Not(IsNull()),
        parentId: Not(IsNull()),
        permanentDeletedAt: IsNull(),
      },
    });

    if (trashItems.length === 0) {
      return { deleted_count: 0 };
    }

    // Get current permissions for all trash items
    const resourceMetaMap = await this.resourcesService.batchGetParentResources(
      namespaceId,
      trashItems.map((resource) => resource.id),
      undefined,
      true,
    );

    const permissionMap = await this.permissionsService.getCurrentPermissions(
      userId,
      namespaceId,
      [...resourceMetaMap.values()],
    );

    // Filter to only items the user has CAN_EDIT permission on
    const editableIds = trashItems
      .filter((resource) => {
        const permission = permissionMap.get(resource.id);
        return (
          permission &&
          comparePermission(permission, ResourcePermission.CAN_EDIT) >= 0
        );
      })
      .map((resource) => resource.id);

    if (editableIds.length === 0) {
      return { deleted_count: 0 };
    }

    const deletedCount = await this.resourcesService.hardDeleteAllTrash(
      namespaceId,
      editableIds,
    );

    return { deleted_count: deletedCount };
  }
}
