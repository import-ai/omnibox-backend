import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, FindOptionsWhere, In, Repository } from 'typeorm';
import { Resource } from 'src/resources/resources.entity';
import { CreateResourceDto } from 'src/resources/dto/create-resource.dto';
import { UpdateResourceDto } from 'src/resources/dto/update-resource.dto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Task } from 'src/tasks/tasks.entity';
import { User } from 'src/user/user.entity';
import { NamespaceMemberService } from 'src/namespace-members/namespace-members.service';
import { Namespace } from 'src/namespaces/namespaces.entity';
import { NamespacesService } from 'src/namespaces/namespaces.service';

export interface IQuery {
  namespace: string;
  parentId: string;
  tags?: string;
}

@Injectable()
export class ResourcesService {
  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    private readonly namespaceService: NamespacesService,
    private readonly namespaceMemberService: NamespaceMemberService,
    private readonly dataSource: DataSource,
  ) { }

  async create(user: User, data: CreateResourceDto) {
    const where: FindOptionsWhere<Resource> = {
      id: data.parentId,
      namespace: { id: data.namespace },
    };
    const parentResource = await this.resourceRepository.findOne({
      where,
      relations: ['namespace'],
    });
    if (!parentResource) {
      throw new BadRequestException("Parent resource not exists.")
    }
    if (data.namespace && parentResource.namespace.id !== data.namespace) {
      throw new BadRequestException(
        "Parent resource's namespace & space must match the resource's.",
      );
    }

    const resource = this.resourceRepository.create({
      ...data,
      user: { id: user.id },
      namespace: { id: data.namespace },
      parent: { id: parentResource.id },
    });

    if (parentResource) {
      parentResource.childCount += 1;
      const parentResourceRepo = this.resourceRepository.create(parentResource);
      await this.resourceRepository.save(parentResourceRepo);
    }

    const savedResource = await this.resourceRepository.save(resource);
    await this.index(user, savedResource);
    return savedResource;
  }

  async index(user: User, resource: Resource) {
    if (resource.resourceType === 'folder' || !resource.content) {
      return;
    }
    const task = this.taskRepository.create({
      function: 'create_or_update_index',
      input: {
        title: resource.name,
        content: resource.content,
        meta_info: {
          user_id: resource.user.id,
          resource_id: resource.id,
          parent_id: resource.parent,
        },
      },
      namespace: resource.namespace,
      user,
    });
    return await this.taskRepository.save(task);
  }

  async deleteIndex(manager: EntityManager, user: User, resource: Resource) {
    const task = manager.create(Task, {
      function: 'delete_index',
      input: {
        resource_id: resource.id,
      },
      namespace: resource.namespace,
      user,
    });
    return await manager.save(task);
  }

  async getRoot(namespace: string, spaceType: string, userId: string) {
    let resource: Resource | null = null;
    if (spaceType == 'teamspace') {
      resource = await this.namespaceService.getTeamspaceRoot(namespace);
    } else {
      resource = await this.namespaceMemberService.getPrivateRoot(userId, namespace);
    }
    const children = await this.query({
      namespace,
      parentId: resource.id,
    });
    return { ...resource, spaceType, children };
  }

  async query({ namespace, parentId, tags }: IQuery) {
    const where: FindOptionsWhere<Resource> = {
      namespace: { id: namespace },
      parent: { id: parentId },
    };
    if (tags) {
      const tagsValue = tags.split(',');
      if (tagsValue.length > 0) {
        where.tags = In(tagsValue);
      }
    }

    return this.resourceRepository.find({ where, relations: ['namespace'] });
  }

  async get(id: string) {
    const resource = await this.resourceRepository.findOne({
      where: {
        id,
      },
      relations: ['namespace'],
    });
    if (!resource) {
      throw new NotFoundException('Resource not found.');
    }
    return resource;
  }

  async update(user: User, id: string, data: UpdateResourceDto) {
    console.debug({ id, data });
    const resource = await this.resourceRepository.findOne({
      where: { id, namespace: { id: data.namespace } },
      relations: ['namespace', 'user'],
    });

    if (!resource) {
      throw new NotFoundException('Resource not found.');
    }

    const newResource = this.resourceRepository.create({
      ...resource,
      ...data,
      namespace: { id: data.namespace },
    });
    const savedNewResource = await this.resourceRepository.save(newResource);
    await this.index(user, savedNewResource);
    return savedNewResource;
  }

  async delete(user: User, id: string) {
    const resource = await this.get(id);
    if (resource.parent === null) {
      throw new BadRequestException('Cannot delete root resource.');
    }
    await this.dataSource.transaction(async manager => {
      await updateChildCount(manager, resource.parent!.id, -1);
      await manager.softDelete(Resource, id);
      await this.deleteIndex(manager, user, resource);
    });
    await this.resourceRepository.softDelete(id); // Delete itself
  }
}

async function updateChildCount(manager: EntityManager, resourceId: string, delta: number) {
  await manager.update(Resource, resourceId, { childCount: () => `childCount + ${delta}` });
}
