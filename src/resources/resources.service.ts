import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  FindOptionsWhere,
  In,
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
import { PermissionLevel } from 'src/permissions/permission-level.enum';
import { SpaceType } from 'src/namespaces/entities/namespace.entity';
import { PermissionsService } from 'src/permissions/permissions.service';

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
      await updateChildCount(manager, parentResource.id, 1);

      const savedResource = await repo.save(resource);
      await WizardTask.index.upsert(
        user,
        savedResource,
        manager.getRepository(Task),
      );
      return savedResource;
    });
    return {
      ...savedResource,
      spaceType: await this.getSpaceType(savedResource),
    };
  }

  async query({ namespaceId, parentId, spaceType, tags, userId }: IQuery) {
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
    const filteredResources: Resource[] = [];
    for (const resource of resources) {
      const hasPermission = await this.permissionsService.userHasPermission(
        namespaceId,
        resource.id,
        userId,
      );
      if (hasPermission) {
        filteredResources.push(resource);
      }
    }
    return filteredResources.map((res) => {
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
