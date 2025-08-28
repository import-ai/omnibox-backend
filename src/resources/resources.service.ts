import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Resource } from './entities/resource.entity';
import { Repository } from 'typeorm';
import { ResourceMetaDto } from './dto/resource-meta.dto';

@Injectable()
export class ResourcesService {
  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
  ) {}

  async getParentResources(
    namespaceId: string,
    resourceId: string | null,
  ): Promise<ResourceMetaDto[]> {
    if (!resourceId) {
      return [];
    }
    const resources: Resource[] = [];
    while (true) {
      const resource = await this.resourceRepository.findOne({
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
        throw new NotFoundException('Resource not found');
      }
      resources.push(resource);
      if (!resource.parentId) {
        break;
      }
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
}
