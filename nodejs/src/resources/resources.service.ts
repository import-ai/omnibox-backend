import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Resource } from './resources.entity';
import { User } from 'src/user/user.entity';

@Injectable()
export class ResourcesService {
  constructor(
    @InjectRepository(Resource)
    private resourceRepository: Repository<Resource>,
  ) {}

  async createResource(data: Partial<Resource>, user: User): Promise<Resource> {
    const parentResource = data.parentId
      ? await this.resourceRepository.findOne({ where: { resourceId: data.parentId } })
      : null;

    if (parentResource && (parentResource.namespaceId !== data.namespaceId || parentResource.spaceType !== data.spaceType)) {
      throw new BadRequestException("Parent resource's namespace & space must match the resource's.");
    }

    const resource = this.resourceRepository.create({
      ...data,
      parentId: parentResource?.resourceId,
    });

    if (parentResource) {
      parentResource.childCount += 1;
      await this.resourceRepository.save(parentResource);
    }

    return this.resourceRepository.save(resource);
  }

  async getRootResource(namespaceId: string, spaceType: string, userId: string): Promise<Resource> {
    const rootResource = await this.resourceRepository.findOne({
      where: { namespaceId, spaceType, parentId: undefined, userId },
    });

    if (!rootResource) {
      throw new NotFoundException('Root resource not found.');
    }

    return rootResource;
  }

  async getResources(query: any): Promise<Resource[]> {
    const { namespaceId, spaceType, parentId, tags } = query;
    const where: any = { namespaceId, spaceType, deletedAt: undefined };

    if (parentId) {
      where.parentId = parentId;
    }

    if (tags) {
      where.tags = tags.split(',');
    }

    return this.resourceRepository.find({ where });
  }

  async updateResource(resourceId: string, data: Partial<Resource>): Promise<Resource> {
    const resource = await this.resourceRepository.findOne({ where: { resourceId } });

    if (!resource) {
      throw new NotFoundException('Resource not found.');
    }

    Object.assign(resource, data);
    return this.resourceRepository.save(resource);
  }

  async deleteResource(resourceId: string): Promise<void> {
    const resource = await this.resourceRepository.findOne({ where: { resourceId } });

    if (!resource) {
      throw new NotFoundException('Resource not found.');
    }

    resource.deletedAt = new Date();
    await this.resourceRepository.save(resource);
  }
}
