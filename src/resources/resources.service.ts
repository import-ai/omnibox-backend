import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Resource } from './entities/resource.entity';
import { Repository } from 'typeorm';

@Injectable()
export class ResourcesService {
  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
  ) {}

  async getParentResources(
    namespaceId: string,
    resourceId: string | null,
  ): Promise<Resource[]> {
    if (!resourceId) {
      return [];
    }
    const resources: Resource[] = [];
    while (true) {
      const resource = await this.resourceRepository.findOne({
        where: { namespaceId, id: resourceId },
        select: [
          'id',
          'name',
          'resourceType',
          'parentId',
          'globalPermission',
          'createdAt',
          'updatedAt',
        ],
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
    return resources;
  }
}
