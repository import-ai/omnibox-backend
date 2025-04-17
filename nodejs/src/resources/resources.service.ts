import { InjectRepository } from '@nestjs/typeorm';
import { In, FindOptionsWhere, Repository } from 'typeorm';
import { Resource } from 'src/resources/resources.entity';
import { CreateResourceDto } from 'src/resources/dto/create-resource.dto';
import { UpdateResourceDto } from 'src/resources/dto/update-resource.dto';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

export interface IQuery {
  namespace: number;
  spaceType: string;
  parentId: number;
  tags?: string;
  userId: number;
}

@Injectable()
export class ResourcesService {
  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
  ) {}

  async create(userId: number, data: CreateResourceDto) {
    let parentResource: any = null;
    if (data.parentId) {
      const where: FindOptionsWhere<Resource> = {
        id: data.parentId,
        namespace: { id: data.namespace },
      };
      if (data.spaceType === 'private') {
        where.user = { id: userId };
      }
      parentResource = await this.resourceRepository.findOne({
        where,
        relations: ['namespace'],
      });
    }

    if (
      parentResource &&
      ((data.namespace && parentResource.namespace.id !== data.namespace) ||
        parentResource.spaceType !== data.spaceType)
    ) {
      throw new BadRequestException(
        "Parent resource's namespace & space must match the resource's.",
      );
    }

    const resource = this.resourceRepository.create({
      ...data,
      user: { id: userId },
      namespace: { id: data.namespace },
      parentId: parentResource ? parentResource.id : 0,
    });

    if (parentResource) {
      parentResource.childCount += 1;
      const parentResourceRepo = this.resourceRepository.create(parentResource);
      await this.resourceRepository.save(parentResourceRepo);
    }

    return await this.resourceRepository.save(resource);
  }

  async getRoot(namespace: number, spaceType: string, userId: number) {
    const where: FindOptionsWhere<Resource> = {
      parentId: 0,
      spaceType: spaceType,
      namespace: { id: namespace },
    };
    if (spaceType === 'private') {
      where.user = { id: userId };
    }
    const data = await this.resourceRepository.findOne({
      where,
      relations: ['namespace'],
    });

    if (!data) {
      throw new NotFoundException('Root resource not found.');
    }

    const children = await this.query({
      userId,
      namespace,
      spaceType,
      parentId: data.id,
    });

    return { ...data, children };
  }

  async query({ namespace, spaceType, parentId, tags, userId }: IQuery) {
    const where: FindOptionsWhere<Resource> = {
      namespace: { id: namespace },
      spaceType: spaceType,
    };
    if (spaceType == 'private') {
      where.user = { id: userId };
    }

    if (parentId) {
      where.parentId = parentId;
    } else {
      where.parentId = 0;
    }

    if (tags) {
      const tagsValue = tags.split(',');
      if (tagsValue.length > 0) {
        where.tags = In(tagsValue);
      }
    }

    return this.resourceRepository.find({ where, relations: ['namespace'] });
  }

  async get(id: number) {
    const resource = await this.resourceRepository.findOne({
      where: {
        id,
      },
      relations: ['namespace'],
    });
    if (!resource) {
      throw new NotFoundException('资源不存在');
    }
    return resource;
  }

  async update(id: number, data: UpdateResourceDto) {
    const resource = await this.resourceRepository.findOne({
      where: { id, namespace: { id: data.namespace } },
      relations: ['namespace'],
    });

    if (!resource) {
      throw new NotFoundException('Resource not found.');
    }

    const newResource = this.resourceRepository.create({
      ...resource,
      ...data,
      namespace: { id: data.namespace },
    });
    return await this.resourceRepository.save(newResource);
  }

  async deleteChildren(id: number) {
    const resources = await this.resourceRepository.find({
      where: {
        parentId: id,
      },
    });
    if (resources.length <= 0) {
      return;
    }
    for (const node of resources) {
      await this.resourceRepository.softDelete(node.id);
      await this.deleteChildren(node.id);
    }
  }

  async delete(id: number) {
    // 更新父级 childCount
    const resource = await this.get(id);
    const parent = await this.resourceRepository.findOne({
      where: {
        id: resource.parentId,
      },
    });
    if (parent) {
      parent.childCount -= 1;
      const parentResource = this.resourceRepository.create(parent);
      await this.resourceRepository.save(parentResource);
    }
    // 删除自身
    await this.resourceRepository.softDelete(id);
    // 递归删除子级
    await this.deleteChildren(id);
  }
}
