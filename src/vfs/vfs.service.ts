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
import { DataSource } from 'typeorm';
import { Transaction, transaction } from 'omniboxd/utils/transaction-utils';
import { VFSFilterResourcesRequestDto } from 'omniboxd/vfs/dto/filter.request.dto';

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
   * @return FileInfoDto[]
   */
  async listChildrenByResourceId(
    namespaceId: string,
    resourceId: string,
    userId: string,
  ) {
    const resources = await this.namespaceResourcesService.listChildren(
      namespaceId,
      resourceId,
      userId,
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
        const fileInfo = FileInfoDto.fromResourceSummaryDto(resource);
        fileInfo.name = resourceName;
        fileInfos.push(fileInfo);
      }
      if (resource.resourceType !== ResourceType.FOLDER) {
        map[`${resourceName}.md`] = true;
        const fileInfo = FileInfoDto.fromResourceSummaryDto(resource);
        fileInfo.name = `${resourceName}.md`;
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
   * @private
   */
  private async getResourcesChainByParsedPathDfs(
    namespaceId: string,
    userId: string,
    resourceNames: string[],
    resources: FileInfoDto[],
  ): Promise<FileInfoDto[]> {
    if (resourceNames.length === 0) {
      return resources;
    }
    const lastResource: FileInfoDto = resources[resources.length - 1];
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
    );
    const fileInfoDto = children.find((x) => x.name === resourceName);

    if (fileInfoDto) {
      return this.getResourcesChainByParsedPathDfs(
        namespaceId,
        userId,
        resourceNames.slice(1),
        [...resources, fileInfoDto],
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

      const lastResource: FileInfoDto = resources[resources.length - 1];

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
   * @returns { ResourceDto, ParsedPathDo }
   */
  async getResourceByPath(
    namespaceId: string,
    userId: string,
    path: string,
  ): Promise<{ resource: ResourceDto; parsedPath: ParsedPathDo }> {
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

    const lastResource: FileInfoDto = resources[resources.length - 1];

    if (lastResource.isDir) {
      throw new AppException(
        `${lastResource.name} is a directory`,
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

    return { resource, parsedPath };
  }

  /**
   * Get resource content by a md path
   * @param namespaceId
   * @param userId
   * @param path
   * @param options
   */
  async getContentByPath(namespaceId: string, userId: string, path: string) {
    const { resource, parsedPath } = await this.getResourceByPath(
      namespaceId,
      userId,
      path,
    );
    return {
      id: resource.id,
      path: parsedPath.path,
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
      );
    } else {
      const teamRootResource: ResourceMetaDto =
        await this.namespacesService.getTeamspaceRoot(namespaceId);
      rootResourceId = teamRootResource.id;
    }

    const resourceIds = [rootResourceId];
    let currentParentId = rootResourceId;

    for (const resourceName of resourceNames) {
      const children = await this.listChildrenByResourceId(
        namespaceId,
        currentParentId,
        userId,
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
   *  if the directory does not exist, create it with `ResourceType.FOLDER`.
   * @param namespaceId
   * @param userId
   * @param path
   * @param content
   */
  async createByPath(
    namespaceId: string,
    userId: string,
    path: string,
    content: string,
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

    const fileName =
      parsedPath.resourceNames[parsedPath.resourceNames.length - 1];

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

        const parentId = parentResourceIds[parentResourceIds.length - 1];

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
        );

        const fileInfoDto = new FileInfoDto();
        fileInfoDto.id = resource.id;
        fileInfoDto.name = parsedPath.path;
        fileInfoDto.createdAt = resource.createdAt.toISOString();
        fileInfoDto.updatedAt = resource.updatedAt.toISOString();
        fileInfoDto.isDir = false;
        return fileInfoDto;
      },
    );
  }

  /**
   * Overwrite a file by path
   *  if the file does not exist, throw the error.
   * @param namespaceId
   * @param userId
   * @param path
   * @param content
   */
  async overwriteByPath(
    namespaceId: string,
    userId: string,
    path: string,
    content: string,
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

    const resources = await this.getResourcesChainByParsedPath(
      namespaceId,
      userId,
      parsedPath.spaceType,
      parsedPath.resourceNames,
    );

    const lastResource: FileInfoDto = resources[resources.length - 1];

    if (lastResource.isDir) {
      throw new AppException(
        `${lastResource.name} is a directory`,
        'INVALID_PATH',
        HttpStatus.BAD_REQUEST,
      );
    }

    const resourceId: string = lastResource.id;

    // Update the resource content
    await this.resourcesService.updateResource(
      namespaceId,
      resourceId,
      userId,
      { content },
    );

    lastResource.name = parsedPath.path;

    return lastResource;
  }

  /**
   * Replace a file's content by path
   *  if the file does not exist, throw the error.
   * @param namespaceId
   * @param userId
   * @param path Absolute path to the file to edit. Must start with '/'.
   * @param oldString Exact string to search for and replace.
   *                Must match exactly including whitespace and indentation.
   * @param newString String to replace old_string with.
   *                Must be different from old_string.
   * @param replaceAll If True, replace all occurrences. If False (default),
   *                old_string must be unique in the file or the edit fails.
   */
  async replaceContentByPath(
    namespaceId: string,
    userId: string,
    path: string,
    oldString: string,
    newString: string,
    replaceAll: boolean,
  ): Promise<{
    path: string;
    occurrences: number;
  }> {
    const { resource, parsedPath } = await this.getResourceByPath(
      namespaceId,
      userId,
      path,
    );

    const content: string = resource.content;

    // Count occurrences of oldString
    let occurrences = 0;
    let pos = content.indexOf(oldString);
    while (pos !== -1) {
      occurrences++;
      pos = content.indexOf(oldString, pos + 1);
    }

    if (occurrences === 0) {
      throw new AppException(
        `oldString not found in file`,
        'STRING_NOT_FOUND',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!replaceAll && occurrences > 1) {
      throw new AppException(
        `oldString is not unique in file (found ${occurrences} occurrences)`,
        'STRING_NOT_UNIQUE',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Perform replacement
    const newContent = replaceAll
      ? content.replaceAll(oldString, newString)
      : content.replace(oldString, newString);

    // Update the resource content
    await this.resourcesService.updateResource(
      namespaceId,
      resource.id,
      userId,
      { content: newContent },
    );

    return {
      path: parsedPath.path,
      occurrences: replaceAll ? occurrences : 1,
    };
  }

  async resourceFilter(
    namespaceId: string,
    requestDto: VFSFilterResourcesRequestDto,
  ): Promise<{ resources: FileInfoDto[]; total: number }> {
    let resourceIds: string[];
    const parsedPath = ParsedPathDo.fromPath(requestDto.path || '/');
    if (!parsedPath.spaceType) {
      const visibleResources: ResourceMetaDto[] =
        await this.namespaceResourcesService.getAllResourcesByUser(
          requestDto.userId,
          namespaceId,
        );
      resourceIds = visibleResources.map((resource) => resource.id);
    } else {
      const resourcesChain = await this.getResourcesChainByParsedPath(
        namespaceId,
        requestDto.userId,
        parsedPath.spaceType,
        parsedPath.resourceNames,
      );
      const lastResource = resourcesChain[resourcesChain.length - 1];
      const visibleResources =
        await this.namespaceResourcesService.getAllSubResourcesByUser(
          requestDto.userId,
          namespaceId,
          lastResource.id,
        );
      resourceIds = visibleResources.map((resource) => resource.id);
    }
    const { resources: filteredResources, total } =
      await this.namespaceResourcesService.resourceFilter(
        namespaceId,
        resourceIds,
        requestDto.options,
      );

    const fileInfoDos: FileInfoDto[] = [];

    for (const resource of filteredResources) {
      const fileInfoDo = new FileInfoDto();
      const parts: string[] = [];
      for (const parentResource of resource.path) {
        if (parentResource.id === resource.id) {
          continue;
        }
        if (parentResource.parentId !== null) {
          parts.push(parentResource.name);
        } else {
          const spaceType = await this.namespaceResourcesService.getSpaceType(
            namespaceId,
            parentResource.id,
          );
          if (spaceType === SpaceType.PRIVATE) {
            parts.push('private');
          } else {
            parts.push('teamspace');
          }
        }
      }
      parts.push(`${resource.name}.md`);
      fileInfoDo.id = resource.id;
      fileInfoDo.path = '/' + parts.join('/');
      fileInfoDo.createdAt = resource.createdAt;
      fileInfoDo.updatedAt = resource.updatedAt;
      fileInfoDo.isDir = false;
      fileInfoDos.push(fileInfoDo);
    }
    return { resources: fileInfoDos, total };
  }
}
