import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Resource } from './entities/resource.entity';
import { EntityManager, Repository } from 'typeorm';
import { ResourceMetaDto } from './dto/resource-meta.dto';
import { UpdateResourceReqDto } from './dto/update-resource-req.dto';
import { WizardTaskService } from 'omniboxd/tasks/wizard-task.service';

const TASK_PRIORITY = 5;

@Injectable()
export class ResourcesService {
  constructor(
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

  async getParentResources(
    namespaceId: string,
    resourceId: string | null,
    entityManager?: EntityManager,
  ): Promise<ResourceMetaDto[]> {
    const resourceRepository = entityManager
      ? entityManager.getRepository(Resource)
      : this.resourceRepository;
    const resources: Resource[] = [];
    while (resourceId) {
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
        return [];
      }
      resources.push(resource);
      resourceId = resource.parentId;
    }
    return resources.map((r) => ResourceMetaDto.fromEntity(r));
  }

  async getSubResources(
    namespaceId: string,
    resourceId: string,
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
      ],
      where: {
        namespaceId,
        parentId: resourceId,
      },
      order: { updatedAt: 'DESC' },
    });
    return children.map((r) => ResourceMetaDto.fromEntity(r));
  }

  async updateResource(
    namespaceId: string,
    resourceId: string,
    userId: string,
    updateReq: UpdateResourceReqDto,
  ) {
    await this.resourceRepository.update(
      { namespaceId, id: resourceId },
      {
        name: updateReq.name,
        parentId: updateReq.parentId,
        tagIds: updateReq.tagIds,
        content: updateReq.content,
        attrs: updateReq.attrs,
      },
    );
    const resource = await this.resourceRepository.findOne({
      where: {
        namespaceId,
        id: resourceId,
      },
    });
    if (!resource) {
      throw new NotFoundException('Resource not found.');
    }
    await this.wizardTaskService.createIndexTask(
      TASK_PRIORITY,
      userId,
      resource,
    );
  }
}
