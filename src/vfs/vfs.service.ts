import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';
import { SpaceType } from 'omniboxd/namespace-resources/dto/resource.dto';
import { TagService } from 'omniboxd/tag/tag.service';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { ResourceMetaDto } from 'omniboxd/resources/dto/resource-meta.dto';
import { FilesService } from 'omniboxd/files/files.service';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';
import { ResourceSummaryDto } from 'omniboxd/namespace-resources/dto/resource-summary.dto';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { ParsedPathDo } from 'omniboxd/vfs/do/parsed-path.do';
import { FileInfoDto } from 'omniboxd/vfs/dto/file-info.dto';
import { listResponseDto } from 'omniboxd/vfs/dto/list.response.dto';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';

const tracer = trace.getTracer('VFSService');

@Injectable()
export class VFSService {
  constructor(
    private readonly namespaceResourcesService: NamespaceResourcesService,
    private readonly tagService: TagService,
    private readonly namespacesService: NamespacesService,
    private readonly resourcesService: ResourcesService,
    private readonly filesService: FilesService,
    private readonly i18n: I18nService,
  ) {}

  private convertResourcesToNames(
    resources: ResourceSummaryDto[],
  ): Record<string, ResourceSummaryDto> {
    const map: Record<string, ResourceSummaryDto> = {};
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
      map[resourceName] = resource;
    }
    return map;
  }

  /**
   * Parse filesystem path into components.
   * @param path - Absolute path like /team, /private, /team/{id}.md, /team/{id}/attachments
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

  private async getResourceIdsFromPath(
    namespaceId: string,
    userId: string,
    resourceNames: string[],
    resourceIds: string[],
  ): Promise<string[]> {
    if (resourceNames.length === 0) {
      return resourceIds;
    }
    const resourceName: string = resourceNames[0];
    const children: ResourceSummaryDto[] =
      await this.namespaceResourcesService.listChildren(
        namespaceId,
        resourceIds[resourceIds.length - 1],
        userId,
      );
    const map = this.convertResourcesToNames(children);
    if (resourceName in map) {
      const resource = map[resourceName];
      return this.getResourceIdsFromPath(
        namespaceId,
        userId,
        resourceNames.slice(1),
        [...resourceIds, resource.id],
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

  async listChildrenByParsedPath(
    namespaceId: string,
    userId: string,
    spaceType: SpaceType,
    resourceNames?: string[],
  ) {
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

    const resourceIds = await this.getResourceIdsFromPath(
      namespaceId,
      userId,
      resourceNames ?? [],
      [rootResourceId],
    );

    return this.namespaceResourcesService.listChildren(
      namespaceId,
      resourceIds[resourceIds.length - 1],
      userId,
    );
  }

  async listChildrenByPath(
    namespaceId: string,
    userId: string,
    path: string,
  ): Promise<listResponseDto> {
    const parsedPath = VFSService.parsePath(path);

    if (parsedPath.spaceType) {
      const resources = await this.listChildrenByParsedPath(
        namespaceId,
        userId,
        parsedPath.spaceType,
        parsedPath.resourceNames,
      );

      const fileInfos: FileInfoDto[] = [];

      for (const resource of resources) {
        const rawFileInfo = FileInfoDto.fromResourceSummaryDto(resource);
        fileInfos.push(rawFileInfo);
        if (
          rawFileInfo.isDir &&
          resource.resourceType !== ResourceType.FOLDER
        ) {
          const fileInfo = FileInfoDto.fromResourceSummaryDto(resource);
          fileInfo.name = `${fileInfo.name}.md`;
          fileInfo.isDir = false;
          fileInfos.push(fileInfo);
        }
      }

      return {
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
      path: '/',
      resources: [
        VFSService.rootDir('private', privateRootResource),
        VFSService.rootDir('teamspace', teamRootResource),
      ],
      total: 2,
    } as listResponseDto;
  }
}
