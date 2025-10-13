import { InjectRepository } from '@nestjs/typeorm';
import duplicateName from 'omniboxd/utils/duplicate-name';
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
import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';
import { CreateResourceDto } from 'omniboxd/namespace-resources/dto/create-resource.dto';
import { UpdateResourceDto } from 'omniboxd/namespace-resources/dto/update-resource.dto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { MinioService } from 'omniboxd/minio/minio.service';
import { WizardTaskService } from 'omniboxd/tasks/wizard-task.service';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { PrivateSearchResourceDto } from 'omniboxd/wizard/dto/agent-request.dto';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { Response } from 'express';
import { ResourceDto, SpaceType } from './dto/resource.dto';
import { Namespace } from 'omniboxd/namespaces/entities/namespace.entity';
import { TagService } from 'omniboxd/tag/tag.service';
import { TagDto } from 'omniboxd/tag/dto/tag.dto';
import { ResourceAttachmentsService } from 'omniboxd/resource-attachments/resource-attachments.service';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { ResourceMetaDto } from 'omniboxd/resources/dto/resource-meta.dto';
import { ChildrenMetaDto } from './dto/list-children-resp.dto';

const TASK_PRIORITY = 5;

@Injectable()
export class NamespaceResourcesService {
  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    @InjectRepository(Namespace)
    private readonly namespaceRepository: Repository<Namespace>,
    private readonly tagService: TagService,
    private readonly dataSource: DataSource,
    private readonly minioService: MinioService,
    private readonly permissionsService: PermissionsService,
    private readonly resourceAttachmentsService: ResourceAttachmentsService,
    private readonly wizardTaskService: WizardTaskService,
    private readonly resourcesService: ResourcesService,
  ) {}

  private async getTagsByIds(
    namespaceId: string,
    tagIds: string[],
  ): Promise<TagDto[]> {
    return await this.tagService.getTagsByIds(namespaceId, tagIds);
  }

  private async getTagsForResources(
    namespaceId: string,
    resources: Resource[],
  ): Promise<Map<string, TagDto[]>> {
    const resourceTagsMap = new Map<string, TagDto[]>();

    // Get all unique tag IDs from all resources
    const allTagIds = new Set<string>();
    resources.forEach((resource) => {
      if (resource.tagIds) {
        resource.tagIds.forEach((tagId) => allTagIds.add(tagId));
      }
    });

    // Fetch all tags at once
    const tags = await this.getTagsByIds(namespaceId, Array.from(allTagIds));
    const tagsById = new Map(tags.map((tag) => [tag.id, tag]));

    // Build the map for each resource
    resources.forEach((resource) => {
      const resourceTags: TagDto[] = [];
      if (resource.tagIds) {
        resource.tagIds.forEach((tagId) => {
          const tag = tagsById.get(tagId);
          if (tag) {
            resourceTags.push(tag);
          }
        });
      }
      resourceTagsMap.set(resource.id, resourceTags);
    });

    return resourceTagsMap;
  }

  private async getResourceIdsByTagNames(
    namespaceId: string,
    tagNames: string[],
  ): Promise<string[]> {
    if (tagNames.length === 0) {
      return [];
    }

    // Get tag IDs by names using tag service
    const tags = await this.tagService.findByNames(namespaceId, tagNames);
    const tagIds = tags.map((tag) => tag.id);
    if (tagIds.length === 0) {
      return [];
    }

    // Find resources that contain any of these tag IDs
    const resources = await this.resourceRepository
      .createQueryBuilder('resource')
      .where('resource.namespace_id = :namespaceId', { namespaceId })
      .andWhere('resource.tag_ids && :tagIds', { tagIds })
      .select('resource.id')
      .getMany();

    return resources.map((resource) => resource.id);
  }

  async findByIds(namespaceId: string, userId: string, ids: Array<string>) {
    if (ids.length <= 0) {
      return [];
    }
    const resources = await this.resourceRepository.find({
      where: {
        namespaceId,
        id: In(ids),
      },
      select: [
        'id',
        'name',
        'attrs',
        'parentId',
        'createdAt',
        'updatedAt',
        'namespaceId',
        'resourceType',
        'tagIds',
      ],
    });

    const filteredResources = await this.permissionFilter(
      namespaceId,
      userId,
      resources,
    );

    // Populate tags for resources
    const tagsMap = await this.getTagsForResources(
      namespaceId,
      filteredResources,
    );

    return filteredResources.map((resource) => ({
      ...resource,
      tags: tagsMap.get(resource.id) || [],
    }));
  }

  async create(
    userId: string,
    data: CreateResourceDto,
    manager?: EntityManager,
  ) {
    if (!manager) {
      return await this.dataSource.transaction(async (manager) => {
        return await this.create(userId, data, manager);
      });
    }

    const ok = await this.permissionsService.userHasPermission(
      data.namespaceId,
      data.parentId,
      userId,
      ResourcePermission.CAN_EDIT,
      undefined,
      manager,
    );
    if (!ok) {
      throw new ForbiddenException('Not authorized to create resource.');
    }

    return await this.resourcesService.createResource(
      {
        ...data,
        userId,
        tagIds: data.tag_ids,
      },
      manager,
    );
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
    ['content', 'attrs'].forEach((key) => {
      if (resource[key]) {
        (newResource as any)[key] = resource[key];
      }
    });

    // Handle tagIds separately since DTO expects tag_ids
    if (resource.tagIds) {
      (newResource as any).tag_ids = resource.tagIds;
    }

    return await this.dataSource.transaction(async (entityManager) => {
      // Create the duplicated resource within the transaction
      const duplicatedResource = await this.create(
        userId,
        newResource,
        entityManager,
      );

      // Copy attachment relations to the duplicated resource within the same transaction
      await this.resourceAttachmentsService.copyAttachmentsToResource(
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
    let resourceIds: string[] = [];

    if (tags) {
      const tagsValue = tags.split(',').filter((tag) => tag.trim());
      if (tagsValue.length > 0) {
        resourceIds = await this.getResourceIdsByTagNames(
          namespaceId,
          tagsValue,
        );
        // If no resources match the tags, return empty array
        if (resourceIds.length === 0) {
          return [];
        }
      }
    }

    const where: FindOptionsWhere<Resource> = {
      namespaceId,
      parentId,
    };

    // If we have tag filtering, add resource ID constraint
    if (resourceIds.length > 0) {
      where.id = In(resourceIds);
    }

    const resources = await this.resourceRepository.find({
      where,
      select: [
        'id',
        'name',
        'attrs',
        'parentId',
        'createdAt',
        'updatedAt',
        'namespaceId',
        'resourceType',
        'tagIds',
      ],
    });

    // Load tags for all resources
    const tagsMap = await this.getTagsForResources(namespaceId, resources);

    const resourcesWithTags = resources.map((resource) => ({
      ...resource,
      tags: tagsMap.get(resource.id) || [],
    }));

    return userId
      ? await this.permissionFilter(namespaceId, userId, resourcesWithTags)
      : resourcesWithTags;
  }

  async move(
    namespaceId: string,
    resourceId: string,
    userId: string,
    targetId: string,
  ) {
    const ok = await this.permissionsService.userHasPermission(
      namespaceId,
      resourceId,
      userId,
    );
    if (!ok) {
      throw new ForbiddenException('Not authorized');
    }
    await this.resourcesService.updateResource(
      namespaceId,
      resourceId,
      userId,
      { parentId: targetId },
    );
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
      const resourceChildren = await this.getSubResourcesByUser(
        namespaceId,
        excludeResourceId,
        userId,
      );
      where.id = Not(
        In([
          excludeResourceId,
          ...resourceChildren.map((children) => children.id),
        ]),
      );
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
    const filteredResources = await this.permissionFilter(
      namespaceId,
      userId,
      resources,
    );
    return filteredResources.map((res) => ResourceMetaDto.fromEntity(res));
  }

  async getSubResourcesByUser(
    namespaceId: string,
    resourceId: string,
    userId: string,
  ): Promise<ResourceMetaDto[]> {
    const parents = await this.resourcesService.getParentResourcesOrFail(
      namespaceId,
      resourceId,
    );
    const children = await this.getSubResourcesByParents(
      namespaceId,
      parents,
      userId,
    );
    return children;
  }

  async getSubResourcesByParents(
    namespaceId: string,
    parents: ResourceMetaDto[],
    userId: string,
  ): Promise<ResourceMetaDto[]> {
    if (!parents) {
      return [];
    }
    const permission = await this.permissionsService.getCurrentPermission(
      namespaceId,
      parents,
      userId,
    );
    if (permission === ResourcePermission.NO_ACCESS) {
      return [];
    }
    const children = await this.resourcesService.getSubResources(namespaceId, [
      parents[0].id,
    ]);
    const filteredChildren: ResourceMetaDto[] = [];
    for (const child of children) {
      const permission = await this.permissionsService.getCurrentPermission(
        namespaceId,
        [child, ...parents],
        userId,
      );
      if (permission !== ResourcePermission.NO_ACCESS) {
        filteredChildren.push(child);
      }
    }
    return filteredChildren;
  }

  async listChildren(
    namespaceId: string,
    resourceId: string,
    userId: string,
  ): Promise<ChildrenMetaDto[]> {
    const parents = await this.resourcesService.getParentResourcesOrFail(
      namespaceId,
      resourceId,
    );
    const children = await this.resourcesService.getSubResources(namespaceId, [
      resourceId,
    ]);
    const subChildren = await this.resourcesService.getSubResources(
      namespaceId,
      children.map((child) => child.id),
    );
    const resources = [...parents, ...children, ...subChildren];
    const permissionMap = await this.permissionsService.getCurrentPermissions(
      namespaceId,
      userId,
      resources,
    );

    const hasChildrenMap = new Map<string, boolean>();
    for (const subChild of subChildren) {
      if (!subChild.parentId) {
        continue;
      }
      const permission = permissionMap.get(subChild.id);
      if (!permission || permission === ResourcePermission.NO_ACCESS) {
        continue;
      }
      hasChildrenMap.set(subChild.parentId, true);
    }

    const childrenDtos: ChildrenMetaDto[] = [];
    for (const child of children) {
      const permission = permissionMap.get(child.id);
      if (!permission || permission === ResourcePermission.NO_ACCESS) {
        continue;
      }
      const hasChildren = hasChildrenMap.get(child.id) || false;
      childrenDtos.push(new ChildrenMetaDto(child, hasChildren));
    }
    return childrenDtos;
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
    const parentResources =
      await this.resourcesService.getParentResourcesOrFail(
        namespaceId,
        resource.parentId,
      );

    const rootResourceId = parentResources
      ? parentResources[parentResources.length - 1].id
      : resourceId;
    const spaceType = await this.getSpaceType(namespaceId, rootResourceId);

    const resourceMeta = ResourceMetaDto.fromEntity(resource);
    const curPermission = await this.permissionsService.getCurrentPermission(
      namespaceId,
      [resourceMeta, ...parentResources],
      userId,
    );

    if (curPermission === ResourcePermission.NO_ACCESS) {
      throw new ForbiddenException('Not authorized');
    }

    // Load tags of the resource
    const tagsMap = await this.getTagsForResources(namespaceId, [resource]);
    const path = [resourceMeta, ...parentResources].reverse();
    return ResourceDto.fromEntity(
      resource,
      curPermission,
      path,
      spaceType,
      tagsMap.get(resource.id) || [],
    );
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

  async update(userId: string, resourceId: string, data: UpdateResourceDto) {
    await this.resourcesService.updateResource(
      data.namespaceId,
      resourceId,
      userId,
      {
        name: data.name,
        tagIds: data.tag_ids,
        content: data.content,
        attrs: data.attrs,
      },
    );
  }

  async delete(userId: string, id: string) {
    const resource = await this.get(id);
    if (!resource.parentId) {
      throw new BadRequestException('Cannot delete root resource.');
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.softDelete(Resource, id);
      await this.wizardTaskService.deleteIndexTask(
        userId,
        resource,
        manager.getRepository(Task),
      );
    });
  }

  async restore(userId: string, id: string) {
    const resource = await this.resourceRepository.findOne({
      withDeleted: true,
      where: {
        id,
      },
    });
    if (!resource) {
      throw new NotFoundException('Resource not found.');
    }
    if (resource.parentId === null) {
      throw new BadRequestException('Cannot restore root resource.');
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.restore(Resource, id);
      await this.wizardTaskService.createIndexTask(
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
    const originalName = decodeURIComponent(fileName);
    const encodedName = fileName;

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
          encoded_name: encodedName,
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

    await this.wizardTaskService.createFileReaderTask(userId, resource);

    return resource;
  }

  async uploadFile(
    userId: string,
    namespaceId: string,
    file: Express.Multer.File,
    fileName: string,
    parentId?: string,
    resourceId?: string,
    source?: string,
  ) {
    const originalFilename = decodeURIComponent(fileName);
    const encodedFilename = fileName;

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

    await this.wizardTaskService.createFileReaderTask(userId, resource, source);

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

  async listAllUserAccessibleResources(
    namespaceId: string,
    userId: string,
    includeRoot: boolean = false,
  ) {
    const resources = await this.resourceRepository.find({
      where: { namespaceId, deletedAt: IsNull() },
    });
    const filteredResources = await this.permissionFilter(
      namespaceId,
      userId,
      resources.filter((res) => res.parentId !== null || includeRoot),
    );

    // Load tags for filtered resources
    const tagsMap = await this.getTagsForResources(
      namespaceId,
      filteredResources,
    );

    return filteredResources.map((resource) => ({
      ...resource,
      tags: tagsMap.get(resource.id) || [],
    }));
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
