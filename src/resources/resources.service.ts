import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Resource, ResourceType } from './entities/resource.entity';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { ResourceMetaDto } from './dto/resource-meta.dto';
import { WizardTaskService } from 'omniboxd/tasks/wizard-task.service';
import { Task } from 'omniboxd/tasks/tasks.entity';

const TASK_PRIORITY = 5;

@Injectable()
export class ResourcesService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    private readonly wizardTaskService: WizardTaskService,
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
      throw new NotFoundException('Resource not found');
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
      throw new NotFoundException('Resource not found');
    }
    return resource;
  }

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
        throw new UnprocessableEntityException(
          'Cycle detected in the resource tree',
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
    parentId: string,
  ): Promise<ResourceMetaDto[]> {
    const resourcesMap: Map<string, ResourceMetaDto> = new Map();
    let parentIds = [parentId];
    while (parentIds.length > 0) {
      const resources = await this.getSubResources(namespaceId, parentIds);
      for (const resource of resources) {
        if (resourcesMap.has(resource.id)) {
          throw new UnprocessableEntityException(
            'Cycle detected in the resource tree',
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
      throw new NotFoundException('Resource not found');
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
      // Check if the parent belongs to the same namespace
      await this.getResourceMetaOrFail(
        namespaceId,
        props.parentId,
        entityManager,
      );

      // Check if there are any cycles
      const parents = await this.getParentResources(
        namespaceId,
        props.parentId,
        entityManager,
      );
      if (parents.find((resource) => resource.id === resourceId)) {
        throw new UnprocessableEntityException(
          'Cannot set parent to a sub-resource',
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
      throw new NotFoundException('Resource not found.');
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

    // Create the resource
    const repo = entityManager.getRepository(Resource);
    const resource = await repo.save(repo.create(props));

    // If it's not a root resource, create index task
    if (resource.parentId) {
      await this.wizardTaskService.createIndexTask(
        TASK_PRIORITY,
        props.userId!,
        resource,
        entityManager.getRepository(Task),
      );
    }

    return resource;
  }
}
