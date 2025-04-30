import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  FindOptionsWhere,
  In,
  Repository,
} from 'typeorm';
import { Resource, SpaceType } from 'src/resources/resources.entity';
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
  namespaceId: string;
  spaceType: SpaceType;
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
  ) {}

  async create(user: User, data: CreateResourceDto) {
    const where: FindOptionsWhere<Resource> = {
      id: data.parentId,
      namespace: { id: data.namespace },
    };
    const savedResource = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Resource);
      const parentResource = await repo.findOne({
        where,
        relations: ['namespace'],
      });
      if (!parentResource) {
        throw new BadRequestException('Parent resource not exists.');
      }
      if (data.namespace && parentResource.namespace.id !== data.namespace) {
        throw new BadRequestException(
          "Parent resource's namespace & space must match the resource's.",
        );
      }

      const resource = repo.create({
        ...data,
        user: { id: user.id },
        namespace: { id: data.namespace },
        parentId: parentResource.id,
      });
      await updateChildCount(manager, parentResource.id, 1);

      const savedResource = await repo.save(resource);
      await this.index(user, savedResource, manager);
      return savedResource;
    });
    return {
      ...savedResource,
      spaceType: await this.getSpaceType(savedResource),
    };
  }

  async index(user: User, resource: Resource, manager?: EntityManager) {
    if (resource.resourceType === 'folder' || !resource.content) {
      return;
    }
    const repo = manager ? manager.getRepository(Task) : this.taskRepository;
    const task = repo.create({
      function: 'create_or_update_index',
      input: {
        title: resource.name,
        content: resource.content,
        meta_info: {
          user_id: resource.user.id,
          resource_id: resource.id,
          parent_id: resource.parentId,
        },
      },
      namespace: resource.namespace,
      user,
    });
    return await repo.save(task);
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

  async getRoot(namespace: string, spaceType: SpaceType, userId: string) {
    let resource: Resource | null = null;
    if (spaceType === 'teamspace') {
      resource = await this.namespaceService.getTeamspaceRoot(namespace);
    } else {
      resource = await this.namespaceMemberService.getPrivateRoot(
        userId,
        namespace,
      );
    }
    const children = await this.query({
      namespaceId: namespace,
      spaceType,
      parentId: resource.id,
    });
    return { ...resource, parentId: '0', spaceType, children };
  }

  async query({ namespaceId, parentId, spaceType, tags }: IQuery) {
    const where: FindOptionsWhere<Resource> = {
      namespace: { id: namespaceId },
      parentId,
    };
    if (tags) {
      const tagsValue = tags.split(',');
      if (tagsValue.length > 0) {
        where.tags = In(tagsValue);
      }
    }

    const resources = await this.resourceRepository.find({
      where,
      relations: ['namespace'],
    });
    return resources.map((res) => {
      return { ...res, spaceType };
    });
  }

  async getSpaceType(resource: Resource): Promise<SpaceType> {
    while (resource.parentId !== null) {
      resource = (await this.resourceRepository.findOne({
        where: { id: resource.parentId },
        relations: ['namespace'],
      }))!;
    }
    return resource.namespace.rootResourceId === resource.id
      ? SpaceType.TEAMSPACE
      : SpaceType.PRIVATE;
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
    const spaceType = await this.getSpaceType(resource);
    return { ...resource, spaceType };
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
    return {
      ...savedNewResource,
      spaceType: await this.getSpaceType(savedNewResource),
    };
  }

  async delete(user: User, id: string) {
    const resource = await this.get(id);
    if (resource.parentId === null) {
      throw new BadRequestException('Cannot delete root resource.');
    }
    await this.dataSource.transaction(async (manager) => {
      await updateChildCount(manager, resource.parentId!, -1);
      await manager.softDelete(Resource, id);
      await this.deleteIndex(manager, user, resource);
    });
    await this.resourceRepository.softDelete(id); // Delete itself
  }
}

async function updateChildCount(
  manager: EntityManager,
  resourceId: string,
  delta: number,
) {
  await manager.update(Resource, resourceId, {
    childCount: () => `childCount + ${delta}`,
  });
}
