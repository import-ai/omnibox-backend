import { InjectRepository } from '@nestjs/typeorm';
import duplicateName from 'omniboxd/utils/duplicate-name';
import {
  encodeFileName,
  getOriginalFileName,
} from 'omniboxd/utils/encode-filename';
import {
  DataSource,
  EntityManager,
  FindOptionsWhere,
  In,
  IsNull,
  Like,
  Not,
  Repository,
} from 'typeorm';
import { Resource, ResourceType } from 'omniboxd/resources/resources.entity';
import { CreateResourceDto } from 'omniboxd/resources/dto/create-resource.dto';
import { UpdateResourceDto } from 'omniboxd/resources/dto/update-resource.dto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { MinioService } from 'omniboxd/minio/minio.service';
import { WizardTask } from 'omniboxd/resources/wizard.task.service';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { PrivateSearchResourceDto } from 'omniboxd/wizard/dto/agent-request.dto';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { Response } from 'express';
import { ResourceDto, ResourceMetaDto, SpaceType } from './dto/resource.dto';
import { Namespace } from 'omniboxd/namespaces/entities/namespace.entity';
import { AttachmentsService } from 'omniboxd/attachments/attachments.service';

const TASK_PRIORITY = 5;

@Injectable()
export class ResourcesService {
  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    @InjectRepository(Namespace)
    private readonly namespaceRepository: Repository<Namespace>,
    private readonly dataSource: DataSource,
    private readonly minioService: MinioService,
    private readonly permissionsService: PermissionsService,
    private readonly attachmentsService: AttachmentsService,
  ) {}

  async findByIds(namespaceId: string, ids: Array<string>) {
    if (ids.length <= 0) {
      return [];
    }
    return await this.resourceRepository.find({
      where: {
        namespaceId,
        id: In(ids),
      },
      select: [
        'id',
        'tags',
        'name',
        'attrs',
        'parentId',
        'updatedAt',
        'namespaceId',
        'resourceType',
      ],
    });
  }

  async create(
    userId: string,
    data: CreateResourceDto,
    manager?: EntityManager,
  ) {
    const ok = await this.permissionsService.userHasPermission(
      data.namespaceId,
      data.parentId,
      userId,
      ResourcePermission.CAN_EDIT,
    );
    if (!ok) {
      throw new ForbiddenException('Not authorized to create resource.');
    }

    const transaction = async (manager: EntityManager) => {
      const repo = manager.getRepository(Resource);
      const parentResource = await repo.findOne({
        where: {
          id: data.parentId,
          namespaceId: data.namespaceId,
        },
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
        userId,
        namespaceId: data.namespaceId,
        parentId: parentResource.id,
      });
      const savedResource = await repo.save(resource);
      await WizardTask.index.upsert(
        TASK_PRIORITY,
        userId,
        savedResource,
        manager.getRepository(Task),
      );
      return savedResource;
    };

    if (manager) {
      return await transaction(manager);
    }
    return await this.dataSource.transaction(async (manager) => {
      return await transaction(manager);
    });
  }

  async duplicate(userId: string, resourceId: string) {
    const resource = await this.get(resourceId);
    if (!resource.parentId) {
      throw new BadRequestException('Cannot duplicate root resource.');
    }
    const newResource = {
      name: duplicateName(resource.name),
      namespaceId: resource.namespaceId,
      resourceType: resource.resourceType,
      parentId: resource.parentId,
    };
    ['tags', 'content', 'attrs'].forEach((key) => {
      if (resource[key]) {
        (newResource as any)[key] = resource[key];
      }
    });

    return await this.dataSource.transaction(async (entityManager) => {
      // Create the duplicated resource within the transaction
      const duplicatedResource = await this.create(
        userId,
        newResource,
        entityManager,
      );
      // Copy attachment relations to the duplicated resource within the same transaction
      await this.attachmentsService.copyAttachmentsToResource(
        resource.namespaceId,
        resource.id,
        duplicatedResource.id,
        entityManager,
      );
      return duplicatedResource;
    });
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

  async query(
    namespaceId: string,
    parentId: string,
    userId?: string, // if is undefined, would skip the permission filter
    tags?: string, // separated by `,`
  ): Promise<Resource[]> {
    const where: FindOptionsWhere<Resource> = {
      namespaceId,
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
        'tags',
        'name',
        'attrs',
        'parentId',
        'updatedAt',
        'namespaceId',
        'resourceType',
      ],
    });
    return userId
      ? await this.permissionFilter(namespaceId, userId, resources)
      : resources;
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

  async search({ namespaceId, excludeResourceId, name, userId }) {
    const where: any = {
      userId,
      // Cannot move to root directory
      parentId: Not(IsNull()),
      namespaceId,
    };
    // Self and child exclusions
    if (excludeResourceId) {
      const resourceChildren = await this.getAllSubResources(
        namespaceId,
        excludeResourceId,
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
    return (await this.permissionFilter(namespaceId, userId, resources)).map(
      (res) => ResourceMetaDto.fromEntity(res),
    );
  }

  async getAllSubResources(
    namespaceId: string,
    parentId: string,
    userId?: string,
    includeRoot: boolean = false,
  ): Promise<Resource[]> {
    let resources: Resource[] = [await this.get(parentId)];
    for (const res of resources) {
      const subResources: Resource[] = await this.query(namespaceId, res.id);
      resources.push(...subResources);
    }
    resources = includeRoot ? resources : resources.slice(1);
    return userId
      ? await this.permissionFilter(namespaceId, userId, resources)
      : resources;
  }

  async listChildren(
    namespaceId: string,
    resourceId: string,
    userId: string,
  ): Promise<ResourceMetaDto[]> {
    const parentResources = await this.getParentResources(
      namespaceId,
      resourceId,
    );
    const permission = await this.permissionsService.getCurrentPermission(
      namespaceId,
      parentResources,
      userId,
    );
    if (permission === ResourcePermission.NO_ACCESS) {
      return [];
    }

    const children = await this.resourceRepository.find({
      select: ['id', 'name', 'parentId', 'resourceType', 'attrs'],
      where: {
        namespaceId,
        parentId: resourceId,
      },
    });

    const filteredChildren: Resource[] = [];
    for (const child of children) {
      const permission = await this.permissionsService.getCurrentPermission(
        namespaceId,
        [child, ...parentResources],
        userId,
      );
      if (permission !== ResourcePermission.NO_ACCESS) {
        filteredChildren.push(child);
      }
    }
    return filteredChildren.map((r) => ResourceMetaDto.fromEntity(r));
  }

  async getSpaceType(
    namespaceId: string,
    rootResourceId: string,
  ): Promise<SpaceType> {
    const count = await this.namespaceRepository.count({
      where: {
        id: namespaceId,
        rootResourceId: rootResourceId,
      },
    });
    return count > 0 ? SpaceType.TEAM : SpaceType.PRIVATE;
  }

  async getPath({
    userId,
    namespaceId,
    resourceId,
  }: {
    userId: string;
    namespaceId: string;
    resourceId: string;
  }): Promise<ResourceDto> {
    const resource = await this.get(resourceId);
    if (resource.namespaceId !== namespaceId) {
      throw new NotFoundException('Not found');
    }
    const parentResources = await this.getParentResources(
      namespaceId,
      resource.parentId,
    );

    const rootResourceId = parentResources
      ? parentResources[parentResources.length - 1].id
      : resourceId;
    const spaceType = await this.getSpaceType(namespaceId, rootResourceId);

    const curPermission = await this.permissionsService.getCurrentPermission(
      namespaceId,
      [resource, ...parentResources],
      userId,
    );

    if (curPermission === ResourcePermission.NO_ACCESS) {
      throw new ForbiddenException('Not authorized');
    }

    const path = [resource, ...parentResources]
      .map((r) => ResourceMetaDto.fromEntity(r))
      .reverse();

    return ResourceDto.fromEntity(resource, curPermission, path, spaceType);
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
    resourceId: string | null,
  ): Promise<Resource[]> {
    if (!resourceId) {
      return [];
    }
    const resources: Resource[] = [];
    while (true) {
      const resource = await this.resourceRepository.findOneOrFail({
        where: { namespaceId, id: resourceId },
        select: ['id', 'name', 'resourceType', 'parentId', 'globalPermission'],
      });
      resources.push(resource);
      if (!resource.parentId) {
        break;
      }
      resourceId = resource.parentId;
    }
    return resources;
  }

  async update(userId: string, id: string, data: UpdateResourceDto) {
    const resource = await this.resourceRepository.findOne({
      where: { id, namespaceId: data.namespaceId },
    });

    if (!resource) {
      throw new NotFoundException('Resource not found.');
    }

    const newResource = this.resourceRepository.create({
      ...resource,
      ...data,
      namespaceId: data.namespaceId,
    });
    const savedNewResource = await this.resourceRepository.save(newResource);
    await WizardTask.index.upsert(
      TASK_PRIORITY,
      userId,
      savedNewResource,
      this.taskRepository,
    );
  }

  async delete(userId: string, id: string) {
    const resource = await this.get(id);
    if (!resource.parentId) {
      throw new BadRequestException('Cannot delete root resource.');
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.softDelete(Resource, id);
      await WizardTask.index.delete(
        userId,
        resource,
        manager.getRepository(Task),
      );
    });
  }

  async restore(userId: string, id: string) {
    const resource = await this.resourceRepository.findOneOrFail({
      withDeleted: true,
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
        userId,
        resource,
        manager.getRepository(Task),
      );
    });
  }

  minioPath(resourceId: string) {
    return `resources/${resourceId}`;
  }

  chunkPath(
    namespaceId: string,
    fileHash: string,
    chunkNumber: string | number,
  ) {
    return `chunks/${namespaceId}/${fileHash}/${chunkNumber}`;
  }

  async uploadFileChunk(
    namespaceId: string,
    chunk: Express.Multer.File,
    chunkNumber: string,
    fileHash: string,
  ) {
    await this.minioService.putChunkObject(
      this.chunkPath(namespaceId, fileHash, chunkNumber),
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
      .map((chunkNumber) => this.chunkPath(namespaceId, fileHash, chunkNumber));
    await Promise.all(
      chunksName.map((name) => this.minioService.removeObject(name)),
    );
  }

  async mergeFileChunks(
    userId: string,
    namespaceId: string,
    totalChunks: number,
    fileHash: string,
    fileName: string,
    mimetype: string,
    parentId?: string,
    resourceId?: string,
  ) {
    const originalName = encodeFileName(fileName);
    let resource: Resource;
    if (resourceId) {
      resource = await this.get(resourceId);
      if (resource.resourceType !== ResourceType.FILE) {
        throw new BadRequestException('Resource is not a file.');
      }
    } else if (parentId) {
      resource = await this.create(userId, {
        name: originalName,
        resourceType: ResourceType.FILE,
        namespaceId,
        parentId,
        attrs: {
          original_name: originalName,
          mimetype: mimetype,
        },
      });
    } else {
      throw new BadRequestException('parent_id or resource_id is required.');
    }

    const artifactName = resource.id;

    const chunksName = Array.from({ length: totalChunks }, (_, i) =>
      this.chunkPath(namespaceId, fileHash, i),
    );

    await this.minioService.composeObject(
      this.minioPath(artifactName),
      chunksName,
    );
    await Promise.all(
      chunksName.map((name) => this.minioService.removeObject(name)),
    );

    resource.attrs = { ...resource.attrs, url: artifactName };
    await this.resourceRepository.save(resource);

    await WizardTask.reader.upsert(userId, resource, this.taskRepository);

    return resource;
  }

  async uploadFile(
    userId: string,
    namespaceId: string,
    file: Express.Multer.File,
    parentId?: string,
    resourceId?: string,
  ) {
    const originalFilename = getOriginalFileName(file.originalname);
    const encodedFilename = encodeFileName(file.originalname);

    let resource: Resource;
    if (resourceId) {
      resource = await this.get(resourceId);
      if (resource.resourceType !== ResourceType.FILE) {
        throw new BadRequestException('Resource is not a file.');
      }
    } else if (parentId) {
      resource = await this.create(userId, {
        name: originalFilename, // Use original filename for display
        resourceType: ResourceType.FILE,
        namespaceId,
        parentId,
        attrs: {
          original_name: originalFilename,
          encoded_name: encodedFilename, // Store encoded name for MinIO
          mimetype: file.mimetype,
        },
      });
    } else {
      throw new BadRequestException('parent_id or resource_id is required.');
    }

    const artifactName = resource.id;

    await this.minioService.putObject(
      this.minioPath(artifactName),
      file.buffer,
      file.mimetype,
    );

    resource.attrs = { ...resource.attrs, url: artifactName };
    await this.resourceRepository.save(resource);

    await WizardTask.reader.upsert(userId, resource, this.taskRepository);

    return resource;
  }

  async downloadFile(resourceId: string) {
    const resource = await this.resourceRepository.findOne({
      where: { id: resourceId },
    });
    if (!resource || resource.resourceType !== ResourceType.FILE) {
      throw new NotFoundException('File resource not found.');
    }
    const artifactName = resource.id;

    const fileStream = await this.minioService.getObject(
      this.minioPath(artifactName),
    );
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
        resourceType: ResourceType.FOLDER,
        namespaceId,
        parentId,
        userId,
      }),
    );
  }

  async listAllUserAccessibleResources(
    namespaceId: string,
    userId: string,
    includeRoot: boolean = false,
  ) {
    const resources = await this.resourceRepository.find({
      where: { namespaceId, deletedAt: IsNull() },
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
    });
  }

  async fileResponse(resourceId: string, response: Response) {
    const { fileStream, resource } = await this.downloadFile(resourceId);
    const encodedName = encodeURIComponent(resource.name);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodedName}"`,
    );
    response.setHeader(
      'Content-Type',
      resource.attrs?.mimetype || 'application/octet-stream',
    );
    fileStream.pipe(response);
  }
}
