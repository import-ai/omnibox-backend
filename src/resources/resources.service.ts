import { Injectable, NotFoundException } from '@nestjs/common';
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

    // Check if the parent belongs to the same namespace
    if (props.parentId) {
      await this.getResourceMetaOrFail(
        namespaceId,
        props.parentId,
        entityManager,
      );
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
