import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import {
  ResourceDto,
  SpaceType,
} from 'omniboxd/namespace-resources/dto/resource.dto';
import { ResourceMetaDto } from 'omniboxd/resources/dto/resource-meta.dto';
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
import { VfsResourceResponseDto } from 'omniboxd/vfs/dto/vfs.resource.response.dto';

const tracer = trace.getTracer('VFSService');

export enum VfsFileType {
  MARKDOWN = 'MARKDOWN',
  FOLDER = 'FOLDER',
}

@Injectable()
export class VfsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly namespaceResourcesService: NamespaceResourcesService,
    private readonly namespacesService: NamespacesService,
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
    // Sort by create time asc
    const sortedResources = resources.sort((a, b) => {
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    return sortedResources.map((r) =>
      FileInfoDto.fromResourceSummaryDto(r, parentPath),
    );
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
    const parentResource: FileInfoDto = last(resources);
    const resourceName: string = resourceNames[0];
    const children: FileInfoDto[] = await this.listChildrenByResourceId(
      namespaceId,
      parentResource.id,
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

  async getRoot(namespaceId: string, userId: string, spaceType: SpaceType) {
    let rootResource: ResourceMetaDto;
    if (spaceType === SpaceType.PRIVATE) {
      rootResource = await this.namespacesService.getPrivateRoot(
        userId,
        namespaceId,
      );
    } else {
      rootResource = await this.namespacesService.getTeamspaceRoot(namespaceId);
    }
    const hasChildren = await this.namespaceResourcesService.hasChildren(
      userId,
      namespaceId,
      rootResource.id,
    );

    return FileInfoDto.fromRootResourceMetoDto(
      spaceType,
      rootResource,
      hasChildren,
    );
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
    const rootFileInfoDto = await this.getRoot(namespaceId, userId, spaceType);
    return await this.getResourcesChainByParsedPathDfs(
      namespaceId,
      userId,
      resourceNames ?? [],
      [rootFileInfoDto],
      rootFileInfoDto.path,
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
    const parsedPath = VfsService.parsePath(path);

    if (parsedPath.spaceType) {
      const resources: FileInfoDto[] = await this.getResourcesChainByParsedPath(
        namespaceId,
        userId,
        parsedPath.spaceType,
        parsedPath.resourceNames,
      );

      const lastResource: FileInfoDto = last(resources);

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
    return {
      id: namespaceId,
      path: '/',
      resources: [
        await this.getRoot(namespaceId, userId, SpaceType.PRIVATE),
        await this.getRoot(namespaceId, userId, SpaceType.TEAM),
      ],
      total: 2,
    } as listResponseDto;
  }

  /**
   * Get fileInfo and parsedPath from path
   * @param namespaceId
   * @param userId
   * @param path
   * @returns { FileInfoDto, ParsedPathDo }
   */
  async getFileInfoDtoByPath(
    namespaceId: string,
    userId: string,
    path: string,
  ): Promise<{
    fileInfo: FileInfoDto;
    parsedPath: ParsedPathDo;
  }> {
    const parsedPath = VfsService.parsePath(path);
    if (!parsedPath.spaceType) {
      throw new AppException(
        'teamspace or private is required',
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
    return { fileInfo: lastResource, parsedPath };
  }

  /**
   * Get resource, fileInfo and parsedPath from path
   * @param namespaceId
   * @param userId
   * @param path
   * @returns { ResourceDto, FileInfoDto, ParsedPathDo }
   */
  async getResourceDtoByPath(
    namespaceId: string,
    userId: string,
    path: string,
  ): Promise<{
    resource: ResourceDto;
    fileInfo: FileInfoDto;
    parsedPath: ParsedPathDo;
  }> {
    const { fileInfo, parsedPath } = await this.getFileInfoDtoByPath(
      namespaceId,
      userId,
      path,
    );

    const resource: ResourceDto =
      await this.namespaceResourcesService.getResource({
        userId,
        namespaceId,
        resourceId: fileInfo.id,
      });

    return { resource, fileInfo, parsedPath };
  }

  /**
   * Get resource content by a md path
   * @param namespaceId
   * @param userId
   * @param path
   */
  async getContentByPath(namespaceId: string, userId: string, path: string) {
    const { resource, fileInfo } = await this.getResourceDtoByPath(
      namespaceId,
      userId,
      path,
    );
    if (fileInfo.isFolder) {
      throw new AppException(
        `${fileInfo.name} is a directory`,
        'FOLDER_NOT_ALLOWED',
        HttpStatus.BAD_REQUEST,
      );
    }
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
        resourceIds.push(resource.id);
        currentParentId = resource.id;
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
    const parsedPath = VfsService.parsePath(path);
    this.assertParsedPathValid(parsedPath);
    const parentResourceNames = parsedPath.resourceNames.slice(0, -1);
    return await transaction(
      this.dataSource.manager,
      async (tx: Transaction) => {
        const { fileInfo } = await this.getFileInfoDtoByPath(
          namespaceId,
          userId,
          '/' + [parsedPath.spaceType, ...parentResourceNames].join('/'),
        );
        // Create the file resource
        const resource = await this.namespaceResourcesService.create(
          userId,
          namespaceId,
          {
            parentId: fileInfo.id,
            resourceType: ResourceType.DOC,
            name: last(parsedPath.resourceNames),
            content,
          },
          tx,
          undefined,
          false, // autoRenameOnConflict disabled for path-based file creation
        );

        return FileInfoDto.fromResource(resource, parsedPath.path, false);
      },
    );
  }

  assertParsedPathValid(
    parsedPath: ParsedPathDo,
  ): asserts parsedPath is ParsedPathDo & {
    spaceType: NonNullable<ParsedPathDo['spaceType']>;
    resourceNames: string[];
  } {
    if (
      !parsedPath.spaceType ||
      !parsedPath.resourceNames ||
      parsedPath.resourceNames.length === 0
    ) {
      throw new AppException(
        `${parsedPath.path} is a directory`,
        'RESOURCE_ALREADY_EXISTS',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Create a folder by path
   *  if the folder exists, throw the error.
   *  the last part of the path is the folder name (without .md extension).
   *  if the parent directories do not exist, they will be created automatically.
   * @param namespaceId
   * @param userId
   * @param path
   * @param createParents
   */
  async createFolderByPath(
    namespaceId: string,
    userId: string,
    path: string,
    createParents: boolean = false,
  ): Promise<FileInfoDto> {
    const parsedPath = VfsService.parsePath(path);
    this.assertParsedPathValid(parsedPath);
    const folderName = last(parsedPath.resourceNames);
    return await transaction(
      this.dataSource.manager,
      async (tx: Transaction) => {
        let parentId: string;
        if (createParents) {
          // Get or create parent directories
          const parentResourceIds = await this.getOrCreateParentDirectories(
            namespaceId,
            userId,
            parsedPath.spaceType as SpaceType,
            parsedPath.resourceNames.slice(0, -1),
            tx,
          );
          parentId = last(parentResourceIds);
        } else {
          const { fileInfo } = await this.getFileInfoDtoByPath(
            namespaceId,
            userId,
            '/' +
              [
                parsedPath.spaceType,
                ...parsedPath.resourceNames.slice(0, -1),
              ].join('/'),
          );
          parentId = fileInfo.id;
        }

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

        return FileInfoDto.fromResource(resource, parsedPath.path, false);
      },
    );
  }

  async getPath(resource: InternalResourceDto): Promise<string> {
    const parts: string[] = [];
    for (const parentResource of resource.path) {
      if (parentResource.id === resource.id) {
        continue;
      }
      if (parentResource.parentId !== null) {
        parts.push(FileInfoDto.getName(parentResource.name, parentResource.id));
      } else {
        const spaceType = await this.namespaceResourcesService.getSpaceType(
          resource.namespaceId,
          parentResource.id,
        );
        parts.push(spaceType);
      }
    }
    parts.push(FileInfoDto.getName(resource.name, resource.id));
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
      const fileInfoDo = FileInfoDto.fromResource(
        resource,
        await this.getPath(resource),
        await this.namespaceResourcesService.hasChildren(
          userId,
          namespaceId,
          resource.id,
        ),
      );
      fileInfoDos.push(fileInfoDo);
    }
    return { resources: fileInfoDos, total };
  }

  async deleteByPath(
    namespaceId: string,
    userId: string,
    path: string,
    recursive?: boolean,
  ): Promise<FileInfoDto> {
    const { fileInfo } = await this.getFileInfoDtoByPath(
      namespaceId,
      userId,
      path,
    );

    if (!fileInfo.parentId) {
      throw new AppException(
        'Cannot delete root directory',
        'CANNOT_DELETE_ROOT_DIRECTORY',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (fileInfo.hasChildren && !recursive) {
      throw new AppException(
        'Resource has children and cannot be deleted',
        'RESOURCE_HAS_CHILDREN',
        HttpStatus.CONFLICT,
      );
    }

    await this.namespaceResourcesService.delete(
      userId,
      namespaceId,
      fileInfo.id,
    );
    return fileInfo;
  }

  async renameByPath(
    namespaceId: string,
    userId: string,
    path: string,
    newName: string,
  ): Promise<FileInfoDto> {
    const { fileInfo, parsedPath } = await this.getFileInfoDtoByPath(
      namespaceId,
      userId,
      path,
    );

    await this.namespaceResourcesService.update(
      namespaceId,
      userId,
      fileInfo.id,
      { name: newName },
    );

    const newPath: string =
      '/' +
      [
        parsedPath.spaceType,
        ...(parsedPath.resourceNames ?? []).slice(0, -1),
        newName,
      ].join('/');

    // Fetch the updated resource to get the real updatedAt from db
    const { fileInfo: fileInfoDto } = await this.getFileInfoDtoByPath(
      namespaceId,
      userId,
      newPath,
    );
    return fileInfoDto;
  }

  async moveByPath(
    namespaceId: string,
    userId: string,
    path: string,
    newParentPath: string,
  ): Promise<FileInfoDto> {
    const { fileInfo: resource } = await this.getFileInfoDtoByPath(
      namespaceId,
      userId,
      path,
    );

    if (!resource.parentId) {
      throw new AppException(
        'Cannot move root resource',
        'CANNOT_MOVE_ROOT_RESOURCE',
        HttpStatus.BAD_REQUEST,
      );
    }

    const { fileInfo: parentResource } = await this.getFileInfoDtoByPath(
      namespaceId,
      userId,
      newParentPath,
    );

    await this.namespaceResourcesService.move(
      namespaceId,
      resource.id,
      userId,
      parentResource.id,
    );

    // Fetch the updated resource to get the real updatedAt from db
    const { fileInfo: fileInfoDto } = await this.getFileInfoDtoByPath(
      namespaceId,
      userId,
      `${newParentPath}/${resource.name}`,
    );
    return fileInfoDto;
  }

  async getPathByResourceId(
    namespaceId: string,
    userId: string,
    resourceId: string,
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
    const path = await this.getPath(resourceInternalDto);
    return { path };
  }

  async getVfsResourceByPath(
    namespaceId: string,
    userId: string,
    path: string,
  ) {
    const { resource, fileInfo } = await this.getResourceDtoByPath(
      namespaceId,
      userId,
      path,
    );
    return VfsResourceResponseDto.fromDto(resource, fileInfo);
  }
}
