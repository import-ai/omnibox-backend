import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, Repository } from 'typeorm';
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

export interface IQuery {
  namespaceId: string;
  spaceType: string;
  parentId: string;
  tags?: string;
  userId: string;
}

@Injectable()
export class ResourcesService {
  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    private readonly minioService: MinioService,
  ) {}

  async create(user: User, data: CreateResourceDto) {
    let parentResource: any = null;
    if (data.parentId) {
      const where: FindOptionsWhere<Resource> = {
        id: data.parentId,
        namespace: { id: data.namespaceId },
      };
      if (data.spaceType === 'private') {
        where.user = { id: user.id };
      }
      parentResource = await this.resourceRepository.findOne({
        where,
        relations: ['namespace'],
      });
    }

    if (
      parentResource &&
      ((data.namespaceId && parentResource.namespace.id !== data.namespaceId) ||
        parentResource.spaceType !== data.spaceType)
    ) {
      throw new BadRequestException(
        "Parent resource's namespace & space must match the resource's.",
      );
    }

    const resource = this.resourceRepository.create({
      ...data,
      user: { id: user.id },
      namespace: { id: data.namespaceId },
      parentId: parentResource ? parentResource.id : '0',
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
          space_type: resource.spaceType,
          resource_id: resource.id,
          parent_id: resource.parentId,
        },
      },
      namespace: resource.namespace,
      user,
    });
    return await this.taskRepository.save(task);
  }

  async deleteIndex(user: User, resource: Resource) {
    const task = this.taskRepository.create({
      function: 'delete_index',
      input: {
        resource_id: resource.id,
      },
      namespace: resource.namespace,
      user,
    });
    return await this.taskRepository.save(task);
  }

  async getRoot(namespaceId: string, spaceType: string, userId: string) {
    const where: FindOptionsWhere<Resource> = {
      parentId: '0',
      spaceType: spaceType,
      namespace: { id: namespaceId },
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
      namespaceId,
      spaceType,
      parentId: data.id,
    });

    return { ...data, children };
  }

  async query({ namespaceId, spaceType, parentId, tags, userId }: IQuery) {
    const where: FindOptionsWhere<Resource> = {
      namespace: { id: namespaceId },
      spaceType: spaceType,
    };
    if (spaceType == 'private') {
      where.user = { id: userId };
    }

    if (parentId) {
      where.parentId = parentId;
    } else {
      where.parentId = '0';
    }

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
    await this.index(user, savedNewResource);
    return savedNewResource;
  }

  async deleteChildren(id: string) {
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

  async delete(user: User, id: string) {
    // Update parent's childCount
    const resource = await this.get(id);
    if (resource.parentId !== '0') {
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
    }
    await this.resourceRepository.softDelete(id); // Delete itself
    await this.deleteChildren(id); // Delete its children

    await this.deleteIndex(user, resource);
  }

  async uploadFile(
    user: User,
    namespaceId: string,
    spaceType: string,
    parentId: string,
    file: Express.Multer.File,
  ) {
    // Create resource first
    const savedResource = await this.create(user, {
      name: file.originalname,
      resourceType: 'file',
      spaceType,
      namespaceId,
      parentId,
      attrs: {
        originalName: file.originalname,
        filename: file.filename,
        mimetype: file.mimetype,
      },
    });

    const artifactName = savedResource.id;

    await this.minioService.putObject(artifactName, file.buffer, file.mimetype);

    const url = await this.minioService.getObjectUrl(artifactName);

    savedResource.attrs = { ...savedResource.attrs, url };
    await this.resourceRepository.save(savedResource);
    return savedResource;
  }

  async downloadFile(namespace: string, resourceId: string) {
    const resource = await this.resourceRepository.findOne({
      where: { id: resourceId, namespace: { id: namespace } },
    });
    if (!resource || resource.resourceType !== 'file') {
      throw new NotFoundException('File resource not found.');
    }
    const artifactName = resource.id;

    const fileStream = await this.minioService.getObject(artifactName);
    return { fileStream, resource };
  }
}
