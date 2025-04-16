import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Resource } from 'src/resources/resources.entity';
import { NamespacesService } from 'src/namespaces/namespaces.service';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

@Injectable()
export class ResourcesService {
  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    private readonly namespacesService: NamespacesService,
  ) {}

  async create(data: Partial<Resource>): Promise<Resource> {
    const parentResource = data.parent_id
      ? await this.resourceRepository.findOne({
          where: { resource_id: data.parent_id },
          relations: ['namespace'],
        })
      : null;

    if (
      parentResource &&
      ((data.namespace &&
        parentResource.namespace.namespace_id !==
          data.namespace.namespace_id) ||
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
      const parentResourceRepo = this.resourceRepository.create(parentResource);
      await this.resourceRepository.save(parentResourceRepo);
    }

    return this.resourceRepository.save(resource);
  }

  async getRoot(
    namespaceId: string,
    spaceType: string,
    userId: string,
  ): Promise<Resource> {
    const rootResource = await this.resourceRepository.findOne({
      where: {
        space_type: spaceType,
        parent_id: undefined,
        user: { user_id: +userId },
        namespace: {
          namespace_id: namespaceId,
        },
      },
      relations: ['user', 'namespace'],
    });

    if (!rootResource) {
      throw new NotFoundException('Root resource not found.');
    }

    return rootResource;
  }

  async get({
    namespaceId,
    spaceType,
    parentId,
    tags,
  }: any): Promise<Resource[]> {
    const namespace = await this.namespacesService.get(namespaceId);

    if (!namespace) {
      throw new NotFoundException('Namespace not found.');
    }

    const where: any = {
      namespace: namespace,
      space_type: spaceType,
    };

    if (parentId) {
      where.parentId = parentId;
    }

    if (tags) {
      where.tags = tags.split(',');
    }

    return this.resourceRepository.find({ where, relations: ['namespace'] });
  }

  async update(resourceId: string, data: Partial<Resource>): Promise<Resource> {
    const resource = await this.resourceRepository.findOne({
      where: { resource_id: resourceId },
    });

    if (!resource) {
      throw new NotFoundException('Resource not found.');
    }

    const newResource = this.resourceRepository.create({
      ...resource,
      ...data,
    });
    return await this.resourceRepository.save(newResource);
  }

  async delete(resourceId: string) {
    const resource = await this.resourceRepository.findOne({
      where: { resource_id: resourceId },
    });

    if (!resource) {
      throw new NotFoundException('Resource not found.');
    }

    await this.resourceRepository.softRemove(resource);
  }
}
