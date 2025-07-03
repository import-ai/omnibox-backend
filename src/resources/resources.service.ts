import { InjectRepository } from '@nestjs/typeorm';
import duplicateName from 'src/utils/duplicate-name';
import encodeFileName from 'src/utils/encode-filename';
import {
  DataSource,
  EntityManager,
  FindOptionsWhere,
  In,
  Like,
  Not,
  IsNull,
  Repository,
} from 'typeorm';
import { Resource } from 'src/resources/resources.entity';
import { CreateResourceDto } from 'src/resources/dto/create-resource.dto';
import { UpdateResourceDto } from 'src/resources/dto/update-resource.dto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Task } from 'src/tasks/tasks.entity';
import { User } from 'src/user/entities/user.entity';
import { MinioService } from 'src/resources/minio/minio.service';
import { WizardTask } from 'src/resources/wizard.task.service';
import { SpaceType } from 'src/namespaces/entities/namespace.entity';
import { PermissionsService } from 'src/permissions/permissions.service';
import { PrivateSearchResourceDto } from 'src/wizard/dto/agent-request.dto';

export interface IQuery {
  namespaceId: string;
  spaceType: SpaceType;
  parentId: string;
  userId: string;
  tags?: string;
}

const TASK_PRIORITY = 5;

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
      if (data.namespaceId && parentResource.namespaceId !== data.namespaceId) {
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
        TASK_PRIORITY,
        user,
        savedResource,
        manager.getRepository(Task),
      );
      return savedResource;
    });
    return savedResource;
  }

  async duplicate(user: User, resourceId: string) {
    const resource = await this.get(resourceId);
    const newResource = {
      name: duplicateName(resource.name),
      namespaceId: resource.namespaceId,
      resourceType: resource.resourceType,
    };
    ['parentId', 'tags', 'content', 'attrs'].forEach((key) => {
      if (resource[key]) {
        (newResource as any)[key] = resource[key];
      }
    });
    return await this.create(user, newResource);
  }

  async permissionFilter<
    T extends string | Resource | PrivateSearchResourceDto,
  >(namespaceId: string, userId: string, resources: T[]): Promise<T[]> {
    const filtered: T[] = [];
    if (resources.length <= 0) {
      return filtered;
    }
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
      select: [
        'id',
        'name',
        'resourceType',
        'parentId',
        'tags',
        'attrs',
        'namespace',
      ],
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

  async move({ namespaceId, resourceId, targetId, userId }) {
    const resourceHasPermission =
      await this.permissionsService.userHasPermission(
        namespaceId,
        resourceId,
        userId,
      );
    if (!resourceHasPermission) {
      throw new ForbiddenException('Not authorized');
    }
    const resource = await this.resourceRepository.findOneByOrFail({
      id: resourceId,
    });
    const newResource = this.resourceRepository.create({
      ...resource,
      parentId: targetId,
    });
    await this.resourceRepository.save(newResource);
  }

  async search({ namespaceId, resourceId, name, userId }) {
    const where: any = {
      user: { id: userId },
      // Cannot move to root directory
      parentId: Not(IsNull()),
      namespace: { id: namespaceId },
    };
    // Self and child exclusions
    if (resourceId) {
      const resourceChildren = await this.getAllSubResources(
        namespaceId,
        resourceId,
        '',
        true,
      );
      where.id = Not(In(resourceChildren.map((children) => children.id)));
    }
    if (name) {
      where.name = Like(`%${name}%`);
    }
    const resources = await this.resourceRepository.find({
      where,
      skip: 0,
      take: 10,
      order: { updatedAt: 'DESC' },
    });
    return await this.permissionFilter(namespaceId, userId, resources);
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

  async listChildren(namespaceId: string, resourceId: string) {
    const resources = await this.resourceRepository.find({
      select: ['id', 'name', 'resourceType', 'parentId', 'tags', 'attrs'],
      where: {
        namespace: { id: namespaceId },
        parentId: resourceId,
      },
    });
    return resources;
  }

  async get(id: string) {
    const resource = await this.resourceRepository.findOne({
      where: {
        id,
      },
    });
    if (!resource) {
      throw new NotFoundException('Resource not found.');
    }
    return resource;
  }

  async getParentResources(
    namespaceId: string,
    resourceId: string,
  ): Promise<Resource[]> {
    const resources: Resource[] = [];
    while (true) {
      const resource = await this.resourceRepository.findOneOrFail({
        where: { namespace: { id: namespaceId }, id: resourceId },
        select: ['id', 'name', 'resourceType', 'parentId', 'globalLevel'],
      });
      resources.push(resource);
      if (!resource.parentId) {
        break;
      }
      resourceId = resource.parentId;
    }
    return resources;
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
    await WizardTask.index.upsert(
      TASK_PRIORITY,
      user,
      savedNewResource,
      this.taskRepository,
    );
    return savedNewResource;
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
  }

  async restore(user: User, id: string) {
    const resource = await this.resourceRepository.findOneOrFail({
      withDeleted: true,
      relations: ['namespace'],
      where: {
        id,
      },
    });
    if (resource.parentId === null) {
      throw new BadRequestException('Cannot restore root resource.');
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.restore(Resource, id);
      await WizardTask.index.upsert(
        TASK_PRIORITY,
        user,
        resource,
        manager.getRepository(Task),
      );
    });
    return await this.get(id);
  }

  async uploadFileChunk(
    namespaceId: string,
    chunk: Express.Multer.File,
    chunkNumber: string,
    fileHash: string,
  ) {
    const chunkObjectName = `${namespaceId}/chunks/${fileHash}/${chunkNumber}`;
    await this.minioService.putChunkObject(
      chunkObjectName,
      chunk.buffer,
      chunk.size,
    );
  }

  async cleanFileChunks(
    namespaceId: string,
    chunksNumber: string,
    fileHash: string,
  ) {
    const chunksName = chunksNumber
      .split(',')
      .map((chunkNumber) => `${namespaceId}/chunks/${fileHash}/${chunkNumber}`);
    await Promise.all(
      chunksName.map((name) => this.minioService.removeObject(name)),
    );
  }

  async mergeFileChunks(
    user: User,
    namespaceId: string,
    totalChunks: number,
    fileHash: string,
    fileName: string,
    mimetype: string,
    parentId?: string,
    resourceId?: string,
  ) {
    const originalname = encodeFileName(fileName);
    let resource: Resource;
    if (resourceId) {
      resource = await this.get(resourceId);
      if (resource.resourceType !== 'file') {
        throw new BadRequestException('Resource is not a file.');
      }
    } else if (parentId) {
      resource = await this.create(user, {
        name: originalname,
        resourceType: 'file',
        namespaceId,
        parentId,
        attrs: {
          original_name: originalname,
          mimetype: mimetype,
        },
      });
    } else {
      throw new BadRequestException('parent_id or resource_id is required.');
    }

    const artifactName = resource.id;

    const chunksName = Array.from(
      { length: totalChunks },
      (_, i) => `${namespaceId}/chunks/${fileHash}/${i}`,
    );

    await this.minioService.composeObject(artifactName, chunksName);
    await Promise.all(
      chunksName.map((name) => this.minioService.removeObject(name)),
    );

    resource.attrs = { ...resource.attrs, url: artifactName };
    await this.resourceRepository.save(resource);

    await WizardTask.reader.upsert(user, resource, this.taskRepository);

    return resource;
  }

  async uploadFile(
    user: User,
    namespaceId: string,
    file: Express.Multer.File,
    parentId?: string,
    resourceId?: string,
  ) {
    file.originalname = encodeFileName(file.originalname);

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

  async listAllResources(offset: number, limit: number) {
    return await this.resourceRepository.find({
      skip: offset,
      take: limit,
      relations: ['namespace', 'user'],
    });
  }
}
