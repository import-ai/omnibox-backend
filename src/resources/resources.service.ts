import { InjectRepository } from '@nestjs/typeorm';
import duplicateName from 'src/utils/duplicate_name';
import {
  DataSource,
  EntityManager,
  FindOptionsWhere,
  In,
  IsNull,
  Repository,
} from 'typeorm';
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
import { MinioService } from 'src/resources/minio/minio.service';
import { WizardTask } from 'src/resources/wizard.task.service';
import { SpaceType } from 'src/namespaces/entities/namespace.entity';
import { PermissionsService } from 'src/permissions/permissions.service';
import { SearchService } from 'src/search/search.service';

export interface IQuery {
  namespaceId: string;
  spaceType: SpaceType;
  parentId: string;
  userId: string;
  tags?: string;
}

function decode(text: string) {
  if (!text) {
    return text;
  }
  return decodeURIComponent(Buffer.from(text, 'binary').toString('utf-8'));
}

@Injectable()
export class ResourcesService {
  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    private readonly dataSource: DataSource,
    private readonly minioService: MinioService,
    private readonly permissionsService: PermissionsService,
    private readonly searchService: SearchService,
  ) {}

  async create(user: User, data: CreateResourceDto) {
    const where: FindOptionsWhere<Resource> = {
      id: data.parentId,
      namespace: { id: data.namespaceId },
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
      if (
        data.namespaceId &&
        parentResource.namespace.id !== data.namespaceId
      ) {
        throw new BadRequestException(
          "Parent resource's namespace & space must match the resource's.",
        );
      }

      const resource = repo.create({
        ...data,
        user: { id: user.id },
        namespace: { id: data.namespaceId },
        parentId: parentResource.id,
      });
      const savedResource = await repo.save(resource);
      await WizardTask.index.upsert(
        user,
        savedResource,
        manager.getRepository(Task),
      );
      return savedResource;
    });
    this.searchService.addResource(savedResource).catch((err) => {
      console.error('Failed to index resource:', err);
    });
    return {
      ...savedResource,
      spaceType: await this.getSpaceType(savedResource),
    };
  }

  async duplicate(user: User, resourceId: string) {
    const resource = await this.get(resourceId);
    const newResource = {
      name: duplicateName(resource.name),
      namespaceId: resource.namespace.id,
      resourceType: resource.resourceType,
    };
    ['parentId', 'tags', 'content', 'attrs'].forEach((key) => {
      if (resource[key]) {
        (newResource as any)[key] = resource[key];
      }
    });
    return await this.create(user, newResource);
  }

  async permissionFilter<T extends string | Resource>(
    namespaceId: string,
    userId: string,
    resources: T[],
  ): Promise<T[]> {
    const filtered: T[] = [];
    for (const res of resources) {
      const resourceId: string = typeof res === 'string' ? res : res.id;
      try {
        const hasPermission: boolean =
          await this.permissionsService.userHasPermission(
            namespaceId,
            resourceId,
            userId,
          );
        if (hasPermission) {
          filtered.push(res);
        }
      } catch {
        /* ignore error */
      }
    }
    return filtered;
  }

  // get resources under parentId
  async queryV2(
    namespaceId: string,
    parentId: string,
    userId?: string, // if is undefined, would skip the permission filter
    tags?: string, // separated by `,`
  ): Promise<Resource[]> {
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
    return userId
      ? await this.permissionFilter(namespaceId, userId, resources)
      : resources;
  }

  async query({ namespaceId, parentId, spaceType, tags, userId }: IQuery) {
    const filteredResources: Resource[] = await this.queryV2(
      namespaceId,
      parentId,
      userId,
      tags,
    );
    return filteredResources.map((res) => {
      return { ...res, spaceType };
    });
  }

  async getAllSubResources(
    namespaceId: string,
    parentId: string,
    userId?: string,
    includeRoot: boolean = false,
  ): Promise<Resource[]> {
    let resources: Resource[] = [await this.get(parentId)];
    for (const res of resources) {
      const subResources: Resource[] = await this.queryV2(namespaceId, res.id);
      resources.push(...subResources);
    }
    resources = includeRoot ? resources : resources.slice(1);
    return userId
      ? await this.permissionFilter(namespaceId, userId, resources)
      : resources;
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
      where: { id, namespace: { id: data.namespaceId } },
      relations: ['namespace', 'user'],
    });

    if (!resource) {
      throw new NotFoundException('Resource not found.');
    }

    const newResource = this.resourceRepository.create({
      ...resource,
      ...data,
      namespace: { id: data.namespaceId },
    });
    const savedNewResource = await this.resourceRepository.save(newResource);
    await WizardTask.index.upsert(user, savedNewResource, this.taskRepository);
    this.searchService.addResource(savedNewResource).catch((err) => {
      console.error('Failed to index resource:', err);
    });
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
      await manager.softDelete(Resource, id);
      await WizardTask.index.delete(
        user,
        resource,
        manager.getRepository(Task),
      );
    });
    await this.resourceRepository.softDelete(id); // Delete itself
  }

  async uploadFile(
    user: User,
    namespaceId: string,
    file: Express.Multer.File,
    parentId?: string,
    resourceId?: string,
  ) {
    // TODO name received is not utf-8 string.
    file.originalname = decode(file.originalname);
    file.filename = decode(file.filename);

    let resource: Resource;
    if (resourceId) {
      resource = await this.get(resourceId);
      if (resource.resourceType !== 'file') {
        throw new BadRequestException('Resource is not a file.');
      }
    } else if (parentId) {
      resource = await this.create(user, {
        name: file.originalname,
        resourceType: 'file',
        namespaceId,
        parentId,
        attrs: {
          original_name: file.originalname,
          filename: file.filename,
          mimetype: file.mimetype,
        },
      });
    } else {
      throw new BadRequestException('parent_id or resource_id is required.');
    }

    const artifactName = resource.id;

    await this.minioService.putObject(artifactName, file.buffer, file.mimetype);

    resource.attrs = { ...resource.attrs, url: artifactName };
    await this.resourceRepository.save(resource);

    await WizardTask.reader.upsert(user, resource, this.taskRepository);

    return resource;
  }

  async downloadFile(resourceId: string) {
    const resource = await this.resourceRepository.findOne({
      where: { id: resourceId },
    });
    if (!resource || resource.resourceType !== 'file') {
      throw new NotFoundException('File resource not found.');
    }
    const artifactName = resource.id;

    const fileStream = await this.minioService.getObject(artifactName);
    return { fileStream, resource };
  }

  async createFolder(
    namespaceId: string,
    parentId: string | null,
    userId: string | null,
    manager: EntityManager,
  ) {
    return await manager.save(
      manager.create(Resource, {
        resourceType: 'folder',
        namespace: { id: namespaceId },
        parentId,
        ...(userId && { user: { id: userId } }),
      }),
    );
  }

  async listAllUserAccessibleResources(
    namespaceId: string,
    userId: string,
    includeRoot: boolean = false,
  ) {
    const resources = await this.resourceRepository.find({
      where: { namespace: { id: namespaceId }, deletedAt: IsNull() },
    });
    return await this.permissionFilter(
      namespaceId,
      userId,
      resources.filter((res) => res.parentId !== null || includeRoot),
    );
  }
}
