import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';
import {
  ResourceDto,
  SpaceType,
} from 'omniboxd/namespace-resources/dto/resource.dto';
import { TagService } from 'omniboxd/tag/tag.service';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { ResourceMetaDto } from 'omniboxd/resources/dto/resource-meta.dto';
import { FilesService } from 'omniboxd/files/files.service';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { ParsedPathDo } from 'omniboxd/vfs/do/parsed-path.do';
import { FileInfoDto } from 'omniboxd/vfs/dto/file-info.dto';
import { listResponseDto } from 'omniboxd/vfs/dto/list.response.dto';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import { GetResponseDto } from 'omniboxd/vfs/dto/get.response.dto';
import { DataSource, EntityManager } from 'typeorm';
import { Transaction, transaction } from 'omniboxd/utils/transaction-utils';
import { VFSFilterResourcesRequestDto } from 'omniboxd/vfs/dto/filter.request.dto';
import { InternalResourceDto } from 'omniboxd/namespace-resources/dto/internal-resource.dto';
import { last } from 'omniboxd/utils/arrays';

const tracer = trace.getTracer('VFSService');

@Injectable()
export class VFSService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly namespaceResourcesService: NamespaceResourcesService,
    private readonly tagService: TagService,
    private readonly namespacesService: NamespacesService,
    private readonly resourcesService: ResourcesService,
    private readonly filesService: FilesService,
    private readonly i18n: I18nService,
  ) {}

  /**
   * Parse filesystem path into components.
   * @param path - Absolute path like /teamspace, /private, /teamspace/{id}.md, /teamspace/{id}/attachments
   * @returns ParsedPath with spaceType, resourceNames, flags
   */
  static parsePath(path: string): ParsedPathDo {
    return tracer.startActiveSpan('VFSService.parsePath', (span) => {
      try {
        const parsedPath = ParsedPathDo.fromPath(path);
        span.setAttributes({
          path: path,
          parsedPathDto: JSON.stringify(parsedPath),
        });
        return parsedPath;
      } catch (err) {
        span.recordException(err);
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw new AppException(
          err.message,
          'INVALID_PATH',
          HttpStatus.BAD_REQUEST,
        );
      } finally {
        span.end();
      }
    });
  }

  /**
   * List children of a specific resource in FileInfoDto[] format
   * @param namespaceId
   * @param resourceId
   * @param userId
   * @param parentPath With this field passed, there would be `path` exists in FileInfoDto
   * @param entityManager
   * @return FileInfoDto[]
   */
  async listChildrenByResourceId(
    namespaceId: string,
    resourceId: string,
    userId: string,
    parentPath?: string,
    entityManager?: EntityManager,
  ) {
    const resources = await this.namespaceResourcesService.listChildren(
      namespaceId,
      resourceId,
      userId,
      {},
      entityManager,
    );
    const fileInfos: FileInfoDto[] = [];
    const map: Record<string, boolean> = {};
    // Sort by create time asc
    const sortedResources = resources.sort((a, b) => {
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    for (const resource of sortedResources) {
      let resourceName: string = resource.name;
      if (resourceName === '') {
        resourceName = resource.id;
      }
      let cnt = 1;
      while (resourceName in map) {
        resourceName = `${resourceName} (${cnt++})`;
      }
      if (FileInfoDto.isDir(resource)) {
        map[resourceName] = true;
        const fileInfo = FileInfoDto.fromResourceSummaryDto(
          resource,
          parentPath,
        );
        fileInfo.name = resourceName;
        fileInfos.push(fileInfo);
      }
      if (resource.resourceType !== ResourceType.FOLDER) {
        map[`${resourceName}.md`] = true;
        const fileInfo = FileInfoDto.fromResourceSummaryDto(
          resource,
          parentPath,
        );
        fileInfo.name = `${fileInfo.name}.md`;
        fileInfo.path = `${fileInfo.path}.md`;
        fileInfo.isDir = false;
        fileInfos.push(fileInfo);
      }
    }
    return fileInfos;
  }

  /**
   * DFS function for getResourcesChainByParsedPath
   * @param namespaceId
   * @param userId
   * @param resourceNames
   * @param resources
   * @param parentPath With this field passed, there would be `path` exists in FileInfoDto
   * @private
   */
  private async getResourcesChainByParsedPathDfs(
    namespaceId: string,
    userId: string,
    resourceNames: string[],
    resources: FileInfoDto[],
    parentPath?: string,
  ): Promise<FileInfoDto[]> {
    if (resourceNames.length === 0) {
      return resources;
    }
    const lastResource: FileInfoDto = last(resources);
    if (!lastResource.isDir) {
      throw new AppException(
        `${lastResource.name} is not a directory`,
        'INVALID_PATH',
        HttpStatus.BAD_REQUEST,
      );
    }
    const resourceName: string = resourceNames[0];
    const children: FileInfoDto[] = await this.listChildrenByResourceId(
      namespaceId,
      lastResource.id,
      userId,
      parentPath,
    );
    const fileInfoDto = children.find((x) => x.name === resourceName);

    if (fileInfoDto) {
      return await this.getResourcesChainByParsedPathDfs(
        namespaceId,
        userId,
        resourceNames.slice(1),
        [...resources, fileInfoDto],
        fileInfoDto.path,
      );
    }
    throw new AppException(
      `${resourceName} not found`,
      'RESOURCE_NOT_FOUND',
      HttpStatus.NOT_FOUND,
    );
  }

  static rootDir(name: string, resource: ResourceMetaDto): FileInfoDto {
    const fileInfo = new FileInfoDto();
    fileInfo.id = resource.id;
    fileInfo.name = name;
    fileInfo.path = `/${name}`;
    fileInfo.createdAt = resource.createdAt.toISOString();
    fileInfo.updatedAt = resource.updatedAt.toISOString();
    fileInfo.isDir = true;
    return fileInfo;
  }

  /**
   * Get resources chain from root to target path
   * @param namespaceId
   * @param userId
   * @param spaceType
   * @param resourceNames
   */
  async getResourcesChainByParsedPath(
    namespaceId: string,
    userId: string,
    spaceType: SpaceType,
    resourceNames?: string[],
  ): Promise<FileInfoDto[]> {
    let rootResource: FileInfoDto;
    if (spaceType === SpaceType.PRIVATE) {
      const privateRootResource: ResourceMetaDto =
        await this.namespacesService.getPrivateRoot(userId, namespaceId);
      rootResource = VFSService.rootDir('private', privateRootResource);
    } else {
      const teamRootResource: ResourceMetaDto =
        await this.namespacesService.getTeamspaceRoot(namespaceId);
      rootResource = VFSService.rootDir('teamspace', teamRootResource);
    }

    return await this.getResourcesChainByParsedPathDfs(
      namespaceId,
      userId,
      resourceNames ?? [],
      [rootResource],
      rootResource.path,
    );
  }

  /**
   * Get fileInfoDto children from path
   * @param namespaceId
   * @param userId
   * @param path
   */
  async listChildrenByPath(
    namespaceId: string,
    userId: string,
    path: string,
  ): Promise<listResponseDto> {
    const parsedPath = VFSService.parsePath(path);

    if (parsedPath.spaceType) {
      const resources: FileInfoDto[] = await this.getResourcesChainByParsedPath(
        namespaceId,
        userId,
        parsedPath.spaceType,
        parsedPath.resourceNames,
      );

      const lastResource: FileInfoDto = last(resources);

      if (!lastResource.isDir) {
        throw new AppException(
          `${lastResource.name} is not a directory`,
          'INVALID_PATH',
          HttpStatus.BAD_REQUEST,
        );
      }

      const resourceId = lastResource.id;
      const fileInfos: FileInfoDto[] = await this.listChildrenByResourceId(
        namespaceId,
        resourceId,
        userId,
        lastResource.path,
      );

      return {
        id: resourceId,
        path: parsedPath.path,
        resources: fileInfos,
        total: fileInfos.length,
      } as listResponseDto;
    }

    const privateRootResource = await this.namespacesService.getPrivateRoot(
      userId,
      namespaceId,
    );
    const teamRootResource: ResourceMetaDto =
      await this.namespacesService.getTeamspaceRoot(namespaceId);
    return {
      id: namespaceId,
      path: '/',
      resources: [
        VFSService.rootDir('private', privateRootResource),
        VFSService.rootDir('teamspace', teamRootResource),
      ],
      total: 2,
    } as listResponseDto;
  }

  /**
   * Get resource and parsedPath from path
   * @param namespaceId
   * @param userId
   * @param path
   * @param targetResourceType Expired resource type
   * @returns { ResourceDto, ParsedPathDo }
   */
  async getResourceByPath(
    namespaceId: string,
    userId: string,
    path: string,
    targetResourceType?: ResourceType.DOC | ResourceType.FOLDER,
  ): Promise<{
    resource: ResourceDto;
    fileInfo: FileInfoDto;
    parsedPath: ParsedPathDo;
  }> {
    const parsedPath = VFSService.parsePath(path);
    if (!parsedPath.spaceType) {
      throw new AppException(
        'teamspace or private is required',
        'INVALID_PATH',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!parsedPath.resourceNames || parsedPath.resourceNames.length === 0) {
      throw new AppException(
        `${parsedPath.spaceType} is a directory`,
        'INVALID_PATH',
        HttpStatus.BAD_REQUEST,
      );
    }

    const resources = await this.getResourcesChainByParsedPath(
      namespaceId,
      userId,
      parsedPath.spaceType,
      parsedPath.resourceNames,
    );

    const lastResource: FileInfoDto = last(resources);

    if (targetResourceType === ResourceType.DOC && lastResource.isDir) {
      throw new AppException(
        `${lastResource.name} is a directory`,
        'INVALID_PATH',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (targetResourceType === ResourceType.FOLDER && !lastResource.isDir) {
      throw new AppException(
        `${lastResource.name} is not a directory`,
        'INVALID_PATH',
        HttpStatus.BAD_REQUEST,
      );
    }

    const resource: ResourceDto =
      await this.namespaceResourcesService.getResource({
        userId,
        namespaceId,
        resourceId: lastResource.id,
      });

    return { resource, fileInfo: lastResource, parsedPath };
  }

  /**
   * Get resource content by a md path
   * @param namespaceId
   * @param userId
   * @param path
   */
  async getContentByPath(namespaceId: string, userId: string, path: string) {
    const { resource, fileInfo } = await this.getResourceByPath(
      namespaceId,
      userId,
      path,
      ResourceType.DOC,
    );
    return {
      ...fileInfo,
      content: resource.content,
    } as GetResponseDto;
  }

  /**
   * Get or create parent directories along the path.
   * Returns the resource IDs including the root.
   */
  private async getOrCreateParentDirectories(
    namespaceId: string,
    userId: string,
    spaceType: SpaceType,
    resourceNames: string[],
    tx: Transaction,
  ): Promise<string[]> {
    let rootResourceId: string;
    if (spaceType === SpaceType.PRIVATE) {
      rootResourceId = await this.namespacesService.getPrivateRootId(
        userId,
        namespaceId,
        tx.entityManager,
      );
    } else {
      const teamRootResource: ResourceMetaDto =
        await this.namespacesService.getTeamspaceRoot(
          namespaceId,
          tx.entityManager,
        );
      rootResourceId = teamRootResource.id;
    }

    const resourceIds = [rootResourceId];
    let currentParentId = rootResourceId;

    for (const resourceName of resourceNames) {
      const children = await this.listChildrenByResourceId(
        namespaceId,
        currentParentId,
        userId,
        undefined,
        tx.entityManager,
      );

      const resource = children.find((child) => child.name === resourceName);

      if (resource) {
        if (!resource.isDir) {
          throw new AppException(
            `${resource.name} is not a directory`,
            'INVALID_PATH',
            HttpStatus.BAD_REQUEST,
          );
        }
        resourceIds.push(resource.id);
        currentParentId = resource.id;
      } else {
        const fileResource = children.find(
          (child) => child.name === `${resourceName}.md`,
        );
        if (fileResource && !fileResource.isDir) {
          // Save the file under a file
          resourceIds.push(fileResource.id);
          currentParentId = fileResource.id;
        } else {
          // Create the folder
          const newFolder = await this.namespaceResourcesService.create(
            userId,
            namespaceId,
            {
              parentId: currentParentId,
              resourceType: ResourceType.FOLDER,
              name: resourceName,
            },
            tx,
            undefined,
            false, // autoRenameOnConflict disabled for path-based folder creation
          );
          resourceIds.push(newFolder.id);
          currentParentId = newFolder.id;
        }
      }
    }

    return resourceIds;
  }

  /**
   * Create a file by path
   *  if the file exists, throw the error.
   *  the last part of the path is the filename, must ends with `.md`, the rest is the path to the directory.
   *  if the directory does not exist, it would be created automatically with `ResourceType.FOLDER`.
   * @param namespaceId
   * @param userId
   * @param path
   * @param content
   */
  async createByPath(
    namespaceId: string,
    userId: string,
    path: string,
    content?: string,
  ): Promise<FileInfoDto> {
    const parsedPath = VFSService.parsePath(path);

    if (!parsedPath.spaceType) {
      throw new AppException(
        'teamspace or private is required',
        'INVALID_PATH',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!parsedPath.resourceNames || parsedPath.resourceNames.length === 0) {
      throw new AppException(
        'filename is required',
        'INVALID_PATH',
        HttpStatus.BAD_REQUEST,
      );
    }

    const fileName = last(parsedPath.resourceNames);

    if (!fileName.endsWith('.md')) {
      throw new AppException(
        'filename must end with .md',
        'INVALID_PATH',
        HttpStatus.BAD_REQUEST,
      );
    }

    let existsFlag: boolean = false;
    try {
      await this.getResourcesChainByParsedPath(
        namespaceId,
        userId,
        parsedPath.spaceType,
        parsedPath.resourceNames,
      );
      existsFlag = true;
    } catch (err) {
      if (!(err instanceof AppException && err.code === 'RESOURCE_NOT_FOUND')) {
        throw err;
      }
    }
    if (existsFlag) {
      throw new AppException(
        `${fileName} already exists`,
        'RESOURCE_ALREADY_EXISTS',
        HttpStatus.CONFLICT,
      );
    }

    const parentResourceNames = parsedPath.resourceNames.slice(0, -1);

    return await transaction(
      this.dataSource.manager,
      async (tx: Transaction) => {
        // Get or create parent directories
        const parentResourceIds = await this.getOrCreateParentDirectories(
          namespaceId,
          userId,
          parsedPath.spaceType as SpaceType,
          parentResourceNames,
          tx,
        );

        const parentId = last(parentResourceIds);

        // Create the file resource
        const resource = await this.namespaceResourcesService.create(
          userId,
          namespaceId,
          {
            parentId,
            resourceType: ResourceType.DOC,
            name: fileName.slice(0, -3), // Remove .md suffix
            content,
          },
          tx,
          undefined,
          false, // autoRenameOnConflict disabled for path-based file creation
        );

        const fileInfoDto = new FileInfoDto();
        fileInfoDto.id = resource.id;
        fileInfoDto.name = resource.name + '.md';
        fileInfoDto.path = parsedPath.path;
        fileInfoDto.createdAt = resource.createdAt.toISOString();
        fileInfoDto.updatedAt = resource.updatedAt.toISOString();
        fileInfoDto.isDir = false;
        return fileInfoDto;
      },
    );
  }

  /**
   * Create a folder by path
   *  if the folder exists, throw the error.
   *  the last part of the path is the folder name (without .md extension).
   *  if the parent directories do not exist, they will be created automatically.
   * @param namespaceId
   * @param userId
   * @param path
   */
  async createFolderByPath(
    namespaceId: string,
    userId: string,
    path: string,
  ): Promise<FileInfoDto> {
    const parsedPath = VFSService.parsePath(path);

    if (!parsedPath.spaceType) {
      throw new AppException(
        'teamspace or private is required',
        'INVALID_PATH',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!parsedPath.resourceNames || parsedPath.resourceNames.length === 0) {
      throw new AppException(
        'folder name is required',
        'INVALID_PATH',
        HttpStatus.BAD_REQUEST,
      );
    }

    const folderName = last(parsedPath.resourceNames);

    if (folderName.endsWith('.md')) {
      throw new AppException(
        'folder name must not end with .md',
        'INVALID_PATH',
        HttpStatus.BAD_REQUEST,
      );
    }

    let existsFlag: boolean = false;
    try {
      await this.getResourcesChainByParsedPath(
        namespaceId,
        userId,
        parsedPath.spaceType,
        parsedPath.resourceNames,
      );
      existsFlag = true;
    } catch (err) {
      if (!(err instanceof AppException && err.code === 'RESOURCE_NOT_FOUND')) {
        throw err;
      }
    }
    if (existsFlag) {
      throw new AppException(
        `${folderName} already exists`,
        'RESOURCE_ALREADY_EXISTS',
        HttpStatus.CONFLICT,
      );
    }

    const parentResourceNames = parsedPath.resourceNames.slice(0, -1);

    return await transaction(
      this.dataSource.manager,
      async (tx: Transaction) => {
        // Get or create parent directories
        const parentResourceIds = await this.getOrCreateParentDirectories(
          namespaceId,
          userId,
          parsedPath.spaceType as SpaceType,
          parentResourceNames,
          tx,
        );

        const parentId = last(parentResourceIds);

        // Create the folder resource
        const resource = await this.namespaceResourcesService.create(
          userId,
          namespaceId,
          {
            parentId,
            resourceType: ResourceType.FOLDER,
            name: folderName,
          },
          tx,
          undefined,
          false, // autoRenameOnConflict disabled for path-based folder creation
        );

        const fileInfoDto = new FileInfoDto();
        fileInfoDto.id = resource.id;
        fileInfoDto.name = resource.name;
        fileInfoDto.path = parsedPath.path;
        fileInfoDto.createdAt = resource.createdAt.toISOString();
        fileInfoDto.updatedAt = resource.updatedAt.toISOString();
        fileInfoDto.isDir = true;
        return fileInfoDto;
      },
    );
  }

  async getPath(
    resource: InternalResourceDto,
    isDir: boolean = false,
  ): Promise<string> {
    const parts: string[] = [];
    for (const parentResource of resource.path) {
      if (parentResource.id === resource.id) {
        continue;
      }
      if (parentResource.parentId !== null) {
        parts.push(parentResource.name);
      } else {
        const spaceType = await this.namespaceResourcesService.getSpaceType(
          resource.namespaceId,
          parentResource.id,
        );
        if (spaceType === SpaceType.PRIVATE) {
          parts.push('private');
        } else {
          parts.push('teamspace');
        }
      }
    }
    if (resource.resourceType === ResourceType.FOLDER && isDir) {
      throw new AppException(
        `${resource.name} is a folder`,
        'INVALID_PATH',
        HttpStatus.BAD_REQUEST,
      );
    }
    parts.push(resource.name + (isDir ? '' : '.md'));
    return '/' + parts.join('/');
  }

  async resourceFilter(
    namespaceId: string,
    userId: string,
    requestDto: VFSFilterResourcesRequestDto,
  ): Promise<{ resources: FileInfoDto[]; total: number }> {
    let resourceIds: string[];
    const parsedPath = ParsedPathDo.fromPath(requestDto.path || '/');
    if (!parsedPath.spaceType) {
      const visibleResources: ResourceMetaDto[] =
        await this.namespaceResourcesService.getAllResourcesByUser(
          userId,
          namespaceId,
        );
      resourceIds = visibleResources.map((resource) => resource.id);
    } else {
      const resourcesChain = await this.getResourcesChainByParsedPath(
        namespaceId,
        userId,
        parsedPath.spaceType,
        parsedPath.resourceNames,
      );
      const lastResource = last(resourcesChain);
      const visibleResources =
        await this.namespaceResourcesService.getAllSubResourcesByUser(
          userId,
          namespaceId,
          lastResource.id,
        );
      resourceIds = visibleResources.map((resource) => resource.id);
    }
    const options = requestDto.options;
    const { resources: filteredResources, total } =
      await this.namespaceResourcesService.resourceFilter(
        namespaceId,
        resourceIds,
        options,
      );

    const fileInfoDos: FileInfoDto[] = [];

    for (const resource of filteredResources) {
      const fileInfoDo = new FileInfoDto();
      fileInfoDo.id = resource.id;
      fileInfoDo.path = await this.getPath(resource);
      fileInfoDo.createdAt = resource.createdAt;
      fileInfoDo.updatedAt = resource.updatedAt;
      fileInfoDo.isDir = false;
      fileInfoDos.push(fileInfoDo);
    }
    return { resources: fileInfoDos, total };
  }

  async deleteByPath(
    namespaceId: string,
    userId: string,
    path: string,
    recursive: boolean,
  ): Promise<FileInfoDto> {
    const { resource, fileInfo } = await this.getResourceByPath(
      namespaceId,
      userId,
      path,
    );

    const hasChildren = await this.namespaceResourcesService.hasChildren(
      userId,
      namespaceId,
      resource.id,
    );

    // Cannot delete resources that have children (even with recursive=true)
    if (hasChildren && !recursive) {
      throw new AppException(
        'Resource has children and cannot be deleted',
        'RESOURCE_HAS_CHILDREN',
        HttpStatus.CONFLICT,
      );
    }

    await this.namespaceResourcesService.delete(
      userId,
      namespaceId,
      resource.id,
    );
    return fileInfo;
  }

  async renameByPath(
    namespaceId: string,
    userId: string,
    path: string,
    newName: string,
  ): Promise<FileInfoDto> {
    const { resource, fileInfo } = await this.getResourceByPath(
      namespaceId,
      userId,
      path,
    );

    // If source is a doc (not a directory), new name must end with .md
    if (!fileInfo.isDir) {
      if (!newName.endsWith('.md')) {
        throw new AppException(
          'New name must end with .md',
          'INVALID_NAME',
          HttpStatus.BAD_REQUEST,
        );
      }
      // Strip .md suffix before saving to database
      newName = newName.slice(0, -3);
    }

    await this.namespaceResourcesService.update(
      namespaceId,
      userId,
      resource.id,
      { name: newName },
    );

    // Build the updated file info with new name
    const updatedFileInfo = new FileInfoDto();
    updatedFileInfo.id = resource.id;
    updatedFileInfo.name = fileInfo.isDir ? newName : `${newName}.md`;
    // Update path: replace the last segment with new name
    if (fileInfo.path) {
      const pathParts = fileInfo.path.split('/');
      pathParts[pathParts.length - 1] = updatedFileInfo.name;
      updatedFileInfo.path = pathParts.join('/');
    }
    updatedFileInfo.createdAt = resource.created_at;
    updatedFileInfo.updatedAt = new Date().toISOString();
    updatedFileInfo.isDir = fileInfo.isDir;

    return updatedFileInfo;
  }

  async moveByPath(
    namespaceId: string,
    userId: string,
    path: string,
    newParentPath: string,
  ): Promise<FileInfoDto> {
    const { resource, fileInfo } = await this.getResourceByPath(
      namespaceId,
      userId,
      path,
    );

    const { resource: parentResource } = await this.getResourceByPath(
      namespaceId,
      userId,
      newParentPath,
      ResourceType.FOLDER,
    );

    await this.namespaceResourcesService.move(
      namespaceId,
      resource.id,
      userId,
      parentResource.id,
    );

    // Fetch the updated resource to get the real updatedAt from db
    const { fileInfo: fileInfoDto } = await this.getResourceByPath(
      namespaceId,
      userId,
      `${newParentPath}/${fileInfo.name}`,
      fileInfo.isDir ? ResourceType.FOLDER : ResourceType.DOC,
    );
    return fileInfoDto;
  }

  async getPathByResourceId(
    namespaceId: string,
    userId: string,
    resourceId: string,
    isDir: boolean = false,
  ): Promise<{ path: string }> {
    if (!resourceId) {
      throw new AppException(
        'resource_id is required',
        'RESOURCE_ID_REQUIRED',
        HttpStatus.BAD_REQUEST,
      );
    }
    const resourceInternalDtoList =
      await this.namespaceResourcesService.batchGetResourceInternalDto(
        namespaceId,
        userId,
        [resourceId],
      );
    const resourceInternalDto = resourceInternalDtoList[0];
    if (!resourceInternalDto) {
      throw new AppException(
        'Resource not found',
        'RESOURCE_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
    const path = await this.getPath(resourceInternalDto, isDir);
    return { path };
  }
}
