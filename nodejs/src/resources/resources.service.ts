import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Resource } from './resources.entity';

@Injectable()
export class ResourcesService {
  constructor(
    @InjectRepository(Resource)
    private resourceRepository: Repository<Resource>,
  ) {}

  async createResource(data: Partial<Resource>): Promise<Resource> {
    const parentResource = data.parent_id
      ? await this.resourceRepository.findOne({
          where: { resource_id: data.parent_id },
        })
      : null;

    if (
      parentResource &&
      (parentResource.namespace_id !== data.namespace_id ||
        parentResource.space_type !== data.space_type)
    ) {
      throw new BadRequestException(
        "Parent resource's namespace & space must match the resource's.",
      );
    }

    const resource = this.resourceRepository.create({
      ...data,
      parent_id: parentResource?.resource_id,
    });

    if (parentResource) {
      parentResource.child_count += 1;
      await this.resourceRepository.save(parentResource);
    }

    return this.resourceRepository.save(resource);
  }

  async getRootResource(
    namespaceId: string,
    spaceType: string,
    userId: string,
  ): Promise<Resource> {
    const rootResource = await this.resourceRepository.findOne({
      where: {
        namespace_id: namespaceId,
        space_type: spaceType,
        parent_id: undefined,
        user_id: userId,
      },
    });

    if (!rootResource) {
      throw new NotFoundException('Root resource not found.');
    }

    return rootResource;
  }

  async getResources(query: any): Promise<Resource[]> {
    const { namespaceId, spaceType, parentId, tags } = query;
    const where: any = {
      namespace_id: namespaceId,
      space_type: spaceType,
      deleted_at: undefined,
    };

    if (parentId) {
      where.parentId = parentId;
    }

    if (tags) {
      where.tags = tags.split(',');
    }

    return this.resourceRepository.find({ where });
  }

  async updateResource(
    resourceId: string,
    data: Partial<Resource>,
  ): Promise<Resource> {
    const resource = await this.resourceRepository.findOne({
      where: { resource_id: resourceId },
    });

    if (!resource) {
      throw new NotFoundException('Resource not found.');
    }

    Object.assign(resource, data);
    return this.resourceRepository.save(resource);
  }

  async deleteResource(resourceId: string): Promise<void> {
    const resource = await this.resourceRepository.findOne({
      where: { resource_id: resourceId },
    });

    if (!resource) {
      throw new NotFoundException('Resource not found.');
    }

    resource.deleted_at = new Date();
    await this.resourceRepository.save(resource);
  }
}
