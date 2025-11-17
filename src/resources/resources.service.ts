import { Injectable, HttpStatus } from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';
import { InjectRepository } from '@nestjs/typeorm';
import { Resource, ResourceType } from './entities/resource.entity';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { ResourceMetaDto } from './dto/resource-meta.dto';
import { WizardTaskService } from 'omniboxd/tasks/wizard-task.service';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { FilesService } from 'omniboxd/files/files.service';

const TASK_PRIORITY = 5;

@Injectable()
export class ResourcesService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    private readonly wizardTaskService: WizardTaskService,
    private readonly i18n: I18nService,
    private readonly filesService: FilesService,
  ) {}

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

  async getSubResources(
    namespaceId: string,
    parentIds: string[],
  ): Promise<ResourceMetaDto[]> {
    const children = await this.resourceRepository.find({
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
        parentId: In(parentIds),
      },
      order: { updatedAt: 'DESC' },
    });
    return children.map((r) => ResourceMetaDto.fromEntity(r));
  }

  async getAllSubResources(
    namespaceId: string,
    parentIds: string[],
  ): Promise<ResourceMetaDto[]> {
    const resourcesMap: Map<string, ResourceMetaDto> = new Map();
    while (parentIds.length > 0) {
      const resources = await this.getSubResources(namespaceId, parentIds);
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
    entityManager?: EntityManager,
  ): Promise<void> {
    if (!entityManager) {
      return await this.dataSource.transaction((entityManager) =>
        this.updateResource(
          namespaceId,
          resourceId,
          userId,
          props,
          entityManager,
        ),
      );
    }

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
    await repo.update({ namespaceId, id: resourceId }, props);

    const resource = await repo.findOne({
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

    // If it's not a root resource, create index task
    if (resource.parentId) {
      await this.wizardTaskService.createIndexTask(
        TASK_PRIORITY,
        userId,
        resource,
        entityManager.getRepository(Task),
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
    entityManager?: EntityManager,
  ): Promise<Resource> {
    if (!entityManager) {
      return await this.dataSource.transaction((entityManager) =>
        this.createResource(props, entityManager),
      );
    }

    // Check if the parent belongs to the same namespace
    if (props.parentId) {
      await this.getResourceMetaOrFail(
        props.namespaceId,
        props.parentId,
        entityManager,
      );
    }

    if (props.fileId) {
      const fileMeta = await this.filesService.headFile(props.fileId);
      if (!fileMeta) {
        const message = this.i18n.t('resource.errors.fileNotFound');
        throw new AppException(
          message,
          'FILE_NOT_FOUND',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
    }

    // Create the resource
    const repo = entityManager.getRepository(Resource);
    const resource = await repo.save(repo.create(props));

    if (
      resource.resourceType === ResourceType.FILE &&
      !resource.content &&
      resource.userId &&
      resource.fileId
    ) {
      // If it's a user-uploaded file, create file reader task
      await this.wizardTaskService.createFileReaderTask(
        resource.userId,
        resource,
        props.source || 'default',
        entityManager.getRepository(Task),
      );
    } else if (resource.parentId) {
      // If it's not a root resource, create index task
      await this.wizardTaskService.createIndexTask(
        TASK_PRIORITY,
        props.userId!,
        resource,
        entityManager.getRepository(Task),
      );
    }

    return resource;
  }

  async restoreResource(
    namespaceId: string,
    resourceId: string,
    entityManager?: EntityManager,
  ): Promise<void> {
    if (!entityManager) {
      return await this.dataSource.transaction((entityManager) =>
        this.restoreResource(namespaceId, resourceId, entityManager),
      );
    }
    await entityManager.restore(Resource, {
      namespaceId,
      id: resourceId,
    });
  }

  async deleteResource(
    namespaceId: string,
    resourceId: string,
    entityManager?: EntityManager,
  ): Promise<void> {
    if (!entityManager) {
      return await this.dataSource.transaction((entityManager) =>
        this.deleteResource(namespaceId, resourceId, entityManager),
      );
    }
    await entityManager.softDelete(Resource, {
      namespaceId,
      id: resourceId,
    });
  }
}
