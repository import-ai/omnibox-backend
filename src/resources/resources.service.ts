import { Injectable, HttpStatus } from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';
import { InjectRepository } from '@nestjs/typeorm';
import { Resource, ResourceType } from './entities/resource.entity';
import {
  DataSource,
  EntityManager,
  In,
  IsNull,
  Not,
  Repository,
} from 'typeorm';
import { ResourceMetaDto } from './dto/resource-meta.dto';
import { WizardTaskService } from 'omniboxd/tasks/wizard-task.service';
import { FilesService } from 'omniboxd/files/files.service';
import { Transaction, transaction } from 'omniboxd/utils/transaction-utils';
import { TasksService } from 'omniboxd/tasks/tasks.service';
import { StorageUsagesService } from 'omniboxd/storage-usages/storage-usages.service';
import { StorageType } from 'omniboxd/storage-usages/entities/storage-usage.entity';
import {
  bigintStringToNumber,
  numberToBigintString,
} from 'omniboxd/utils/bigint-utils';
import { isOptional } from 'omniboxd/utils/is-empty';

const TASK_PRIORITY = 5;

@Injectable()
export class ResourcesService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    private readonly wizardTaskService: WizardTaskService,
    private readonly tasksService: TasksService,
    private readonly i18n: I18nService,
    private readonly filesService: FilesService,
    private readonly storageUsagesService: StorageUsagesService,
  ) {}

  private validateResourceName(name: string | undefined): void {
    if (name && name.includes('/')) {
      const message = this.i18n.t('resource.errors.resourceNameContainsSlash');
      throw new AppException(
        message,
        'RESOURCE_NAME_CONTAINS_SLASH',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private async checkNameConflict(
    namespaceId: string,
    parentId: string | null,
    name: string | undefined,
    excludeId?: string,
    entityManager?: EntityManager,
  ): Promise<void> {
    if (!name) {
      return;
    }
    const repo = entityManager
      ? entityManager.getRepository(Resource)
      : this.resourceRepository;
    const qb = repo
      .createQueryBuilder('resource')
      .where('resource.namespace_id = :namespaceId', { namespaceId })
      .andWhere('resource.parent_id IS NOT DISTINCT FROM :parentId', {
        parentId,
      })
      .andWhere('LOWER(resource.name) = LOWER(:name)', { name })
      .andWhere('resource.deleted_at IS NULL');
    if (excludeId) {
      qb.andWhere('resource.id != :excludeId', { excludeId });
    }
    const count = await qb.getCount();
    if (count > 0) {
      const message = this.i18n.t('resource.errors.resourceNameConflict');
      throw new AppException(
        message,
        'RESOURCE_NAME_CONFLICT',
        HttpStatus.CONFLICT,
      );
    }
  }

  async getParentResourcesOrFail(
    namespaceId: string,
    resourceId: string | null,
    entityManager?: EntityManager,
  ): Promise<ResourceMetaDto[]> {
    if (!resourceId) {
      return [];
    }
    const resources = await this.getParentResources(
      namespaceId,
      resourceId,
      entityManager,
    );
    if (resources.length === 0) {
      const message = this.i18n.t('resource.errors.resourceNotFound');
      throw new AppException(
        message,
        'RESOURCE_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
    return resources;
  }

  async getResourceMeta(
    namespaceId: string,
    resourceId: string,
    entityManager?: EntityManager,
  ): Promise<ResourceMetaDto | null> {
    const resourceRepository = entityManager
      ? entityManager.getRepository(Resource)
      : this.resourceRepository;
    const resource = await resourceRepository.findOne({
      select: [
        'id',
        'name',
        'parentId',
        'resourceType',
        'globalPermission',
        'attrs',
        'fileId',
        'createdAt',
        'updatedAt',
      ],
      where: { namespaceId, id: resourceId },
    });
    if (!resource) {
      return null;
    }
    return ResourceMetaDto.fromEntity(resource);
  }

  async batchGetResourceMeta(
    namespaceId: string,
    resourceIds: string[],
    entityManager?: EntityManager,
  ): Promise<Map<string, ResourceMetaDto>> {
    if (resourceIds.length === 0) {
      return new Map();
    }

    resourceIds = [...new Set(resourceIds)];

    const resourceRepository = entityManager
      ? entityManager.getRepository(Resource)
      : this.resourceRepository;
    const resources = await resourceRepository.find({
      select: [
        'id',
        'name',
        'parentId',
        'resourceType',
        'globalPermission',
        'attrs',
        'fileId',
        'createdAt',
        'updatedAt',
      ],
      where: { namespaceId, id: In(resourceIds) },
    });

    const resourceMap = new Map<string, ResourceMetaDto>();
    for (const resource of resources) {
      resourceMap.set(resource.id, ResourceMetaDto.fromEntity(resource));
    }
    return resourceMap;
  }

  async getResourceMetaOrFail(
    namespaceId: string,
    resourceId: string,
    entityManager?: EntityManager,
  ): Promise<ResourceMetaDto> {
    const resource = await this.getResourceMeta(
      namespaceId,
      resourceId,
      entityManager,
    );
    if (!resource) {
      const message = this.i18n.t('resource.errors.resourceNotFound');
      throw new AppException(
        message,
        'RESOURCE_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
    return resource;
  }

  async batchGetParentResources(
    namespaceId: string,
    resourceIds: string[],
    entityManager?: EntityManager,
  ): Promise<Map<string, ResourceMetaDto>> {
    const resourceMap: Map<string, ResourceMetaDto> = new Map();
    while (resourceIds.length > 0) {
      const resources = await this.batchGetResourceMeta(
        namespaceId,
        resourceIds,
        entityManager,
      );

      for (const resource of resources.values()) {
        resourceMap.set(resource.id, resource);
      }

      resourceIds = [];
      for (const resource of resources.values()) {
        if (!resource.parentId) {
          continue;
        }
        if (resourceMap.has(resource.parentId)) {
          continue;
        }
        resourceIds.push(resource.parentId);
      }
    }
    return resourceMap;
  }

  /**
   * Return the parents of a resource, including the resource itself.
   */
  async getParentResources(
    namespaceId: string,
    resourceId: string | null,
    entityManager?: EntityManager,
  ): Promise<ResourceMetaDto[]> {
    const resources: ResourceMetaDto[] = [];
    while (resourceId) {
      const resource = await this.getResourceMeta(
        namespaceId,
        resourceId,
        entityManager,
      );
      if (!resource) {
        return [];
      }
      if (resources.find((r) => r.id === resource.id)) {
        const message = this.i18n.t('resource.errors.cycleDetected');
        throw new AppException(
          message,
          'CYCLE_DETECTED',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      resources.push(resource);
      resourceId = resource.parentId;
    }
    return resources;
  }

  /**
   * Get children resources with configurable fields
   * @param summary - if true, includes content/timestamps for folder view
   */
  async getChildren(
    namespaceId: string,
    parentIds: string[],
    options?: {
      summary?: boolean;
      limit?: number;
      offset?: number;
    },
  ): Promise<Resource[]> {
    const baseFields: (keyof Resource)[] = [
      'id',
      'name',
      'parentId',
      'resourceType',
      'globalPermission',
      'attrs',
      'createdAt',
      'updatedAt',
    ];
    const summaryFields: (keyof Resource)[] = ['content'];
    const select = options?.summary
      ? [...baseFields, ...summaryFields]
      : baseFields;

    return await this.resourceRepository.find({
      select,
      where: {
        namespaceId,
        parentId: In(parentIds),
      },
      order: { updatedAt: 'DESC' },
      ...(options?.limit !== undefined && { take: options.limit }),
      ...(options?.offset !== undefined && { skip: options.offset }),
    });
  }

  async getAllSubResources(
    namespaceId: string,
    parentIds: string[],
  ): Promise<ResourceMetaDto[]> {
    const resourcesMap: Map<string, ResourceMetaDto> = new Map();
    while (parentIds.length > 0) {
      const children = await this.getChildren(namespaceId, parentIds);
      const resources = children.map((r) => ResourceMetaDto.fromEntity(r));
      for (const resource of resources) {
        if (resourcesMap.has(resource.id)) {
          const message = this.i18n.t('resource.errors.cycleDetected');
          throw new AppException(
            message,
            'CYCLE_DETECTED',
            HttpStatus.UNPROCESSABLE_ENTITY,
          );
        }
        resourcesMap.set(resource.id, resource);
      }
      parentIds = resources.map((r) => r.id);
    }
    return [...resourcesMap.values()];
  }

  async getAllResources(namespaceId: string): Promise<ResourceMetaDto[]> {
    const dbResources = await this.resourceRepository.find({
      select: [
        'id',
        'name',
        'parentId',
        'resourceType',
        'globalPermission',
        'createdAt',
        'updatedAt',
        'attrs',
      ],
      where: {
        namespaceId,
      },
    });

    const resources = dbResources.map((r) => ResourceMetaDto.fromEntity(r));
    const resourcesMap: Map<string, ResourceMetaDto> = new Map();
    for (const resource of resources) {
      resourcesMap.set(resource.id, resource);
    }

    // Filter deleted resources.
    // Every resource should be reachable from a root, otherwise it's considered deleted.
    const reachableMap: Map<string, boolean> = new Map();
    const isReachable = (resourceId: string): boolean => {
      const reachable = reachableMap.get(resourceId);
      if (reachable !== undefined) {
        return reachable;
      }
      reachableMap.set(resourceId, false);
      const resource = resourcesMap.get(resourceId);
      if (!resource) {
        return false;
      }
      // If it's a root, or its parent is reachable
      if (!resource.parentId || isReachable(resource.parentId)) {
        reachableMap.set(resourceId, true);
        return true;
      }
      return false;
    };
    return resources.filter((r) => isReachable(r.id));
  }

  async getResource(
    namespaceId: string,
    resourceId: string,
  ): Promise<Resource | null> {
    return await this.resourceRepository.findOne({
      where: { namespaceId, id: resourceId },
    });
  }

  async resourceFilter(
    namespaceId: string,
    resourceIds: string[],
    options?: {
      createdAtBefore?: Date;
      createdAtAfter?: Date;
      updatedAtBefore?: Date;
      updatedAtAfter?: Date;
      tagIds?: string[];
      namePattern?: string;
      contentPattern?: string;
      urlPattern?: string;
      userId?: string;
      parentId?: string;
      resourceTypes?: ResourceType[];
      offset?: number;
      limit?: number;
    },
  ): Promise<{ resources: Resource[]; total: number }> {
    if (!resourceIds || resourceIds.length === 0) {
      throw new AppException(
        'Invalid resourceIds',
        'INVALID_RESOURCE_IDS',
        HttpStatus.BAD_REQUEST,
      );
    }

    const fields = [
      'createdAtBefore',
      'createdAtAfter',
      'updatedAtBefore',
      'updatedAtAfter',
      'tagIds',
      'namePattern',
      'contentPattern',
      'urlPattern',
      'userId',
      'parentId',
      'resourceTypes',
      'offset',
      'limit',
    ];
    if (
      !options ||
      !Object.entries(options).some(
        ([k, v]) => fields.includes(k) && !isOptional(v),
      )
    ) {
      throw new AppException(
        'At least one filter parameter is required',
        'FILTER_REQUIRED',
        HttpStatus.BAD_REQUEST,
      );
    }
    const queryBuilder = this.resourceRepository
      .createQueryBuilder('resource')
      .where('resource.namespace_id = :namespaceId', { namespaceId })
      .andWhere('resource.id IN (:...resourceIds)', { resourceIds });

    if (!isOptional(options.createdAtBefore)) {
      queryBuilder.andWhere('resource.created_at < :createdAtBefore', {
        createdAtBefore: options.createdAtBefore,
      });
    }
    if (!isOptional(options.createdAtAfter)) {
      queryBuilder.andWhere('resource.created_at > :createdAtAfter', {
        createdAtAfter: options.createdAtAfter,
      });
    }
    if (!isOptional(options.updatedAtBefore)) {
      queryBuilder.andWhere('resource.updated_at < :updatedAtBefore', {
        updatedAtBefore: options.updatedAtBefore,
      });
    }
    if (!isOptional(options.updatedAtAfter)) {
      queryBuilder.andWhere('resource.updated_at > :updatedAtAfter', {
        updatedAtAfter: options.updatedAtAfter,
      });
    }
    if (!isOptional(options.tagIds)) {
      queryBuilder.andWhere('resource.tag_ids && :tagIds', {
        tagIds: options.tagIds,
      });
    }
    if (!isOptional(options.namePattern)) {
      queryBuilder.andWhere('resource.name ~* :namePattern', {
        namePattern: options.namePattern,
      });
    }
    if (!isOptional(options.contentPattern)) {
      queryBuilder.andWhere('resource.content ~* :contentPattern', {
        contentPattern: options.contentPattern,
      });
    }
    if (!isOptional(options.urlPattern)) {
      queryBuilder.andWhere("resource.attrs->>'url' ~* :urlPattern", {
        urlPattern: options.urlPattern,
      });
    }
    if (!isOptional(options.userId)) {
      queryBuilder.andWhere('resource.user_id = :userId', {
        userId: options.userId,
      });
    }
    if (!isOptional(options.parentId)) {
      queryBuilder.andWhere('resource.parent_id = :parentId', {
        parentId: options.parentId,
      });
    }
    if (!isOptional(options.resourceTypes)) {
      queryBuilder.andWhere('resource.resource_type IN (:...resourceTypes)', {
        resourceTypes: options.resourceTypes,
      });
    }
    queryBuilder
      .orderBy('resource.created_at', 'DESC')
      .addOrderBy('resource.id', 'ASC');
    if (!isOptional(options.offset)) {
      queryBuilder.skip(options.offset);
    }
    if (!isOptional(options.limit)) {
      queryBuilder.take(options.limit);
    }
    const [resources, total] = await queryBuilder.getManyAndCount();
    return { resources, total };
  }

  async batchGetResources(
    namespaceId: string,
    resourceIds?: string[],
    createdAtBefore?: Date,
    createdAtAfter?: Date,
    userId?: string,
    parentId?: string,
    tagIds?: string[],
    nameContains?: string,
    contentContains?: string,
  ): Promise<Resource[]> {
    const hasFilter =
      (resourceIds && resourceIds.length > 0) ||
      createdAtBefore ||
      createdAtAfter ||
      userId ||
      parentId ||
      (tagIds && tagIds.length > 0) ||
      nameContains ||
      contentContains;
    if (!hasFilter) {
      throw new AppException(
        'At least one filter parameter is required',
        'FILTER_REQUIRED',
        HttpStatus.BAD_REQUEST,
      );
    }

    const queryBuilder = this.resourceRepository
      .createQueryBuilder('resource')
      .where('resource.namespace_id = :namespaceId', { namespaceId });

    if (resourceIds) {
      if (resourceIds.length === 0) {
        return [];
      }
      queryBuilder.andWhere('resource.id IN (:...resourceIds)', {
        resourceIds,
      });
    }
    if (createdAtBefore) {
      queryBuilder.andWhere('resource.created_at <= :createdAtBefore', {
        createdAtBefore,
      });
    }
    if (createdAtAfter) {
      queryBuilder.andWhere('resource.created_at >= :createdAtAfter', {
        createdAtAfter,
      });
    }
    if (userId) {
      queryBuilder.andWhere('resource.user_id = :userId', { userId });
    }
    if (parentId) {
      queryBuilder.andWhere('resource.parent_id = :parentId', { parentId });
    }
    if (tagIds) {
      queryBuilder.andWhere('resource.tag_ids && :tagIds', { tagIds });
    }
    if (nameContains) {
      queryBuilder.andWhere('resource.name ILIKE :nameContains', {
        nameContains: `%${nameContains}%`,
      });
    }
    if (contentContains) {
      queryBuilder.andWhere('resource.content ILIKE :contentContains', {
        contentContains: `%${contentContains}%`,
      });
    }

    return await queryBuilder.getMany();
  }

  async getResourceOrFail(
    namespaceId: string,
    resourceId: string,
  ): Promise<Resource> {
    const resource = await this.getResource(namespaceId, resourceId);
    if (!resource) {
      const message = this.i18n.t('resource.errors.resourceNotFound');
      throw new AppException(
        message,
        'RESOURCE_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
    return resource;
  }

  async updateResource(
    namespaceId: string,
    resourceId: string,
    userId: string,
    props: {
      name?: string;
      parentId?: string;
      tagIds?: string[];
      content?: string;
      attrs?: Record<string, any>;
    },
    tx?: Transaction,
  ): Promise<void> {
    if (!tx) {
      return await transaction(this.dataSource.manager, (tx) =>
        this.updateResource(namespaceId, resourceId, userId, props, tx),
      );
    }

    const entityManager = tx.entityManager;

    if (props.parentId) {
      const parents = await this.getParentResourcesOrFail(
        namespaceId,
        props.parentId,
        entityManager,
      );
      if (parents.find((resource) => resource.id === resourceId)) {
        const message = this.i18n.t(
          'resource.errors.cannotSetParentToSubResource',
        );
        throw new AppException(
          message,
          'CANNOT_SET_PARENT_TO_SUB_RESOURCE',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
    }

    const repo = entityManager.getRepository(Resource);

    const oldResource = await repo.findOne({
      where: {
        namespaceId,
        id: resourceId,
      },
      lock: { mode: 'pessimistic_write' },
    });
    if (!oldResource) {
      const message = this.i18n.t('resource.errors.resourceNotFound');
      throw new AppException(
        message,
        'RESOURCE_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }

    // Validate resource name
    if (props.name !== undefined) {
      this.validateResourceName(props.name);
    }
    // Check name conflict on rename
    if (props.name !== undefined && !props.parentId) {
      await this.checkNameConflict(
        namespaceId,
        oldResource.parentId,
        props.name,
        resourceId,
        entityManager,
      );
    }
    // Check name conflict on move (or move + rename)
    if (props.parentId) {
      const effectiveName = props.name ?? oldResource.name;
      await this.checkNameConflict(
        namespaceId,
        props.parentId,
        effectiveName,
        resourceId,
        entityManager,
      );
    }

    const contentSize =
      props.content !== undefined
        ? Buffer.byteLength(props.content, 'utf8')
        : undefined;

    await repo.update(
      { namespaceId, id: resourceId },
      {
        ...props,
        ...(contentSize !== undefined && {
          contentSize: numberToBigintString(contentSize),
        }),
      },
    );

    const resource = await repo.findOneOrFail({
      where: {
        namespaceId,
        id: resourceId,
      },
    });

    // Update storage usage if content changed and userId is present
    if (props.content !== undefined && resource.userId) {
      const contentSizeDiff =
        bigintStringToNumber(resource.contentSize) -
        bigintStringToNumber(oldResource.contentSize);
      if (contentSizeDiff !== 0) {
        await this.storageUsagesService.updateStorageUsage(
          namespaceId,
          resource.userId,
          StorageType.CONTENT,
          contentSizeDiff,
          tx,
        );
      }
    }

    // If it's not a root resource, create index task
    if (resource.parentId) {
      await this.wizardTaskService.emitUpsertIndexTask(
        TASK_PRIORITY,
        userId,
        resource,
        tx,
      );
    }
  }

  async createResource(
    props: {
      namespaceId: string;
      parentId: string | null;
      userId: string | null;
      resourceType: ResourceType;
      name?: string;
      tagIds?: string[];
      content?: string;
      attrs?: Record<string, any>;
      fileId?: string;
      source?: string;
    },
    tx?: Transaction,
  ): Promise<Resource> {
    if (!tx) {
      return await transaction(this.dataSource.manager, (tx) =>
        this.createResource(props, tx),
      );
    }

    const entityManager = tx.entityManager;

    // Check if the parent belongs to the same namespace
    if (props.parentId) {
      await this.getResourceMetaOrFail(
        props.namespaceId,
        props.parentId,
        entityManager,
      );
    }

    // Validate resource name
    this.validateResourceName(props.name);
    await this.checkNameConflict(
      props.namespaceId,
      props.parentId,
      props.name,
      undefined,
      entityManager,
    );

    if (props.fileId) {
      const file = await this.filesService.getFile(
        props.namespaceId,
        props.fileId,
      );
      if (!file) {
        const message = this.i18n.t('resource.errors.fileNotFound');
        throw new AppException(
          message,
          'FILE_NOT_FOUND',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      if (props.userId && file.size !== null) {
        await this.storageUsagesService.updateStorageUsage(
          props.namespaceId,
          props.userId,
          StorageType.UPLOAD,
          bigintStringToNumber(file.size),
          tx,
        );
      }
    }

    const contentSize = props.content
      ? Buffer.byteLength(props.content, 'utf8')
      : 0;

    const repo = entityManager.getRepository(Resource);
    const resource = await repo.save(
      repo.create({
        ...props,
        contentSize: numberToBigintString(contentSize),
      }),
    );

    if (bigintStringToNumber(resource.contentSize) > 0 && resource.userId) {
      await this.storageUsagesService.updateStorageUsage(
        resource.namespaceId,
        resource.userId,
        StorageType.CONTENT,
        bigintStringToNumber(resource.contentSize),
        tx,
      );
    }

    if (
      resource.resourceType === ResourceType.FILE &&
      !resource.content &&
      resource.userId &&
      resource.fileId
    ) {
      // If it's a user-uploaded file, create file reader task
      await this.wizardTaskService.emitFileReaderTask(
        resource.userId,
        resource,
        props.source || 'default',
        tx,
      );
    } else if (resource.parentId) {
      // If it's not a root resource, create index task
      await this.wizardTaskService.emitUpsertIndexTask(
        TASK_PRIORITY,
        props.userId!,
        resource,
        tx,
      );
    }

    return resource;
  }

  async restoreResource(
    userId: string,
    namespaceId: string,
    resourceId: string,
    tx?: Transaction,
  ): Promise<void> {
    if (!tx) {
      return await transaction(this.dataSource.manager, (tx) =>
        this.restoreResource(userId, namespaceId, resourceId, tx),
      );
    }

    // Check if resource exists and is not permanently deleted
    const resource = await tx.entityManager.findOne(Resource, {
      withDeleted: true,
      where: { namespaceId, id: resourceId },
    });

    if (!resource || !resource.deletedAt) {
      return; // Not in trash
    }

    if (resource.permanentDeletedAt) {
      const message = this.i18n.t('resource.errors.trashItemNotFound');
      throw new AppException(
        message,
        'TRASH_ITEM_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }

    const result = await tx.entityManager.restore(Resource, {
      namespaceId,
      id: resourceId,
    });
    if (result.affected !== 1) {
      return;
    }
    if (bigintStringToNumber(resource.contentSize) > 0 && resource.userId) {
      await this.storageUsagesService.updateStorageUsage(
        namespaceId,
        resource.userId,
        StorageType.CONTENT,
        bigintStringToNumber(resource.contentSize),
        tx,
      );
    }
    if (resource.fileId && resource.userId) {
      const fileMeta = await this.filesService.headFile(resource.fileId);
      if (fileMeta && fileMeta.contentLength) {
        await this.storageUsagesService.updateStorageUsage(
          namespaceId,
          resource.userId,
          StorageType.UPLOAD,
          fileMeta.contentLength,
          tx,
        );
      }
    }
    const restoredResource = await tx.entityManager.findOneOrFail(Resource, {
      where: { namespaceId, id: resourceId },
    });
    if (restoredResource.parentId) {
      // If it's not a root resource, create index task
      await this.wizardTaskService.emitUpsertIndexTask(
        TASK_PRIORITY,
        userId,
        restoredResource,
        tx,
      );
    }
  }

  async deleteResource(
    userId: string,
    namespaceId: string,
    resourceId: string,
    tx?: Transaction,
  ): Promise<void> {
    if (!tx) {
      return await transaction(this.dataSource.manager, (tx) =>
        this.deleteResource(userId, namespaceId, resourceId, tx),
      );
    }

    const resource = await tx.entityManager.findOne(Resource, {
      where: { namespaceId, id: resourceId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!resource) {
      const message = this.i18n.t('resource.errors.resourceNotFound');
      throw new AppException(
        message,
        'RESOURCE_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }

    await tx.entityManager.softDelete(Resource, {
      namespaceId,
      id: resourceId,
    });

    if (bigintStringToNumber(resource.contentSize) > 0 && resource.userId) {
      await this.storageUsagesService.updateStorageUsage(
        namespaceId,
        resource.userId,
        StorageType.CONTENT,
        -bigintStringToNumber(resource.contentSize),
        tx,
      );
    }

    if (resource.fileId && resource.userId) {
      const fileMeta = await this.filesService.headFile(resource.fileId);
      if (fileMeta && fileMeta.contentLength) {
        await this.storageUsagesService.updateStorageUsage(
          namespaceId,
          resource.userId,
          StorageType.UPLOAD,
          -fileMeta.contentLength,
          tx,
        );
      }
    }

    await this.tasksService.cancelResourceTasks(namespaceId, resourceId, tx);
    await this.wizardTaskService.emitDeleteIndexTask(
      userId,
      namespaceId,
      resourceId,
      tx,
    );
  }

  async getDeletedResources(
    namespaceId: string,
    retentionDays: number,
    options?: {
      search?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ items: Resource[]; total: number }> {
    const { search, limit = 20, offset = 0 } = options || {};

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const queryBuilder = this.resourceRepository
      .createQueryBuilder('resource')
      .select([
        'resource.id',
        'resource.name',
        'resource.parentId',
        'resource.resourceType',
        'resource.globalPermission',
        'resource.attrs',
        'resource.createdAt',
        'resource.updatedAt',
        'resource.deletedAt',
      ])
      .withDeleted()
      .where('resource.namespace_id = :namespaceId', { namespaceId })
      .andWhere('resource.deleted_at IS NOT NULL')
      .andWhere('resource.deleted_at >= :cutoffDate', { cutoffDate })
      .andWhere('resource.parent_id IS NOT NULL')
      .andWhere('resource.permanent_deleted_at IS NULL');

    if (search) {
      queryBuilder.andWhere('resource.name ILIKE :search', {
        search: `%${search}%`,
      });
    }

    const total = await queryBuilder.getCount();

    const items = await queryBuilder
      .orderBy('resource.deleted_at', 'DESC')
      .skip(offset)
      .take(limit)
      .getMany();

    return { items, total };
  }

  async hardDeleteResource(
    namespaceId: string,
    resourceId: string,
    tx?: Transaction,
  ): Promise<void> {
    if (!tx) {
      return await transaction(this.dataSource.manager, (tx) =>
        this.hardDeleteResource(namespaceId, resourceId, tx),
      );
    }

    const repo = tx.entityManager.getRepository(Resource);
    const resource = await repo.findOne({
      withDeleted: true,
      where: { namespaceId, id: resourceId },
    });

    if (!resource) {
      const message = this.i18n.t('resource.errors.trashItemNotFound');
      throw new AppException(
        message,
        'TRASH_ITEM_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }

    if (!resource.deletedAt) {
      const message = this.i18n.t('resource.errors.trashItemNotFound');
      throw new AppException(
        message,
        'TRASH_ITEM_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }

    if (!resource.parentId) {
      const message = this.i18n.t(
        'resource.errors.cannotPermanentlyDeleteRoot',
      );
      throw new AppException(
        message,
        'CANNOT_PERMANENTLY_DELETE_ROOT',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Check if already permanently deleted
    if (resource.permanentDeletedAt) {
      const message = this.i18n.t('resource.errors.trashItemNotFound');
      throw new AppException(
        message,
        'TRASH_ITEM_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }

    // Set permanent_deleted_at timestamp (children become inaccessible automatically)
    const now = new Date();
    await repo.update({ id: resourceId }, { permanentDeletedAt: now });
  }

  async hardDeleteAllTrash(
    namespaceId: string,
    tx?: Transaction,
  ): Promise<number> {
    if (!tx) {
      return await transaction(this.dataSource.manager, (tx) =>
        this.hardDeleteAllTrash(namespaceId, tx),
      );
    }

    const repo = tx.entityManager.getRepository(Resource);
    const now = new Date();

    // Find all deleted resources that haven't been permanently deleted yet
    // (excluding root resources)
    const deletedResources = await repo.find({
      withDeleted: true,
      where: {
        namespaceId,
        deletedAt: Not(IsNull()),
        parentId: Not(IsNull()),
        permanentDeletedAt: IsNull(),
      },
    });

    if (deletedResources.length === 0) {
      return 0;
    }

    // Bulk update all resources with permanent_deleted_at
    const resourceIds = deletedResources.map((r) => r.id);
    await repo.update({ id: In(resourceIds) }, { permanentDeletedAt: now });

    return deletedResources.length;
  }

  async getDeletedResourceOrFail(
    namespaceId: string,
    resourceId: string,
  ): Promise<Resource> {
    const resource = await this.resourceRepository.findOne({
      withDeleted: true,
      where: { namespaceId, id: resourceId },
    });

    if (!resource || !resource.deletedAt || resource.permanentDeletedAt) {
      const message = this.i18n.t('resource.errors.trashItemNotFound');
      throw new AppException(
        message,
        'TRASH_ITEM_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }

    return resource;
  }

  async isParentDeleted(
    namespaceId: string,
    parentId: string | null,
  ): Promise<boolean> {
    if (!parentId) {
      return false;
    }

    const parent = await this.resourceRepository.findOne({
      withDeleted: true,
      where: { namespaceId, id: parentId },
    });

    return !parent || !!parent.deletedAt;
  }

  async recalculateContentSizes(
    namespaceId?: string,
    batchSize: number = 100,
  ): Promise<{
    processed: number;
  }> {
    let processed = 0;
    while (true) {
      const resources = await this.resourceRepository.find({
        where: {
          contentSize: '0',
          content: Not(''),
          userId: Not(IsNull()),
          namespaceId,
        },
        take: batchSize,
      });
      if (resources.length === 0) {
        break;
      }
      for (const resource of resources) {
        const contentSize = Buffer.byteLength(resource.content, 'utf8');
        if (contentSize === 0) {
          return { processed };
        }
        await transaction(this.dataSource.manager, async (tx) => {
          const result = await tx.entityManager.update(
            Resource,
            { id: resource.id, contentSize: '0' },
            { contentSize: numberToBigintString(contentSize) },
          );
          if (result.affected !== 1) {
            return;
          }
          await this.storageUsagesService.updateStorageUsage(
            resource.namespaceId,
            resource.userId!,
            StorageType.CONTENT,
            contentSize,
            tx,
          );
        });
        processed++;
      }
    }
    return {
      processed,
    };
  }
}
