import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import { SharedResourcesService } from 'omniboxd/shared-resources/shared-resources.service';
import { Share } from 'omniboxd/shares/entities/share.entity';
import { FileInfoDto } from 'omniboxd/vfs/dto/file-info.dto';
import { VFSFilterResourcesRequestDto } from 'omniboxd/vfs/dto/filter.request.dto';
import { FilterResponseDto } from 'omniboxd/vfs/dto/filter.response.dto';
import { GetResponseDto } from 'omniboxd/vfs/dto/get.response.dto';
import { ListResponseDto } from 'omniboxd/vfs/dto/list.response.dto';
import { SharedResourceDto } from 'omniboxd/shared-resources/dto/shared-resource.dto';
import { ShareParsedPathDo } from './do/share-parsed-path.do';
import { SharedVfsResourceResponseDto } from './dto/shared-vfs.resource.response.dto';

/**
 * Shared VFS path format:
 * - `/` returns one virtual folder entry named `share`.
 * - `/share` is the virtual shared root and lists exactly one resource: the actual shared root.
 * - `/share/{root-name}` maps to the real shared root resource (`share.resourceId`).
 * - `/share/{root-name}/...` traverses descendants under the shared root by resource name.
 */
const SHARE_ROOT_ID = 'share-root';

@Injectable()
export class SharedVfsService {
  constructor(
    private readonly sharedResourcesService: SharedResourcesService,
  ) {}

  async listChildrenByPath(
    share: Share,
    path: string,
    offset: number = 0,
    limit: number = 20,
  ): Promise<ListResponseDto> {
    const parent = await this.resolveResourceByPath(share, path);
    const resources = await this.resolveChildren(share, parent);
    return {
      parentId: parent.id,
      parentPath: parent.path!,
      resources: resources.slice(offset, offset + limit),
      total: resources.length,
    };
  }

  async getContentByPath(share: Share, path: string): Promise<GetResponseDto> {
    const fileInfo = await this.resolveResourceByPath(share, path);
    if (fileInfo.isFolder()) {
      throw new AppException(
        `${fileInfo.name} is a directory`,
        'FOLDER_NOT_ALLOWED',
        HttpStatus.BAD_REQUEST,
      );
    }
    const resource = await this.sharedResourcesService.getAndValidateResource(
      share,
      fileInfo.id,
    );
    return {
      ...fileInfo,
      content: resource.content,
    } as GetResponseDto;
  }

  async getVfsResourceByPath(
    share: Share,
    path: string,
  ): Promise<SharedVfsResourceResponseDto> {
    const fileInfo = await this.resolveResourceByPath(share, path);
    if (!fileInfo.id || fileInfo.id === SHARE_ROOT_ID) {
      const synthetic = new SharedResourceDto();
      synthetic.id = fileInfo.id;
      synthetic.name = fileInfo.name ?? 'share';
      synthetic.resource_type = ResourceType.FOLDER;
      synthetic.content = '';
      synthetic.tags = [];
      synthetic.path = [];
      synthetic.attrs = {};
      synthetic.created_at = share.createdAt.toISOString();
      synthetic.updated_at = share.updatedAt.toISOString();
      return SharedVfsResourceResponseDto.fromDto(synthetic, fileInfo);
    } else {
      const sharedResource =
        await this.sharedResourcesService.getSharedResource(share, fileInfo.id);
      return SharedVfsResourceResponseDto.fromDto(sharedResource, fileInfo);
    }
  }

  async resourceFilter(
    share: Share,
    requestDto: VFSFilterResourcesRequestDto,
  ): Promise<FilterResponseDto> {
    const resource = await this.resolveResourceByPath(
      share,
      requestDto.path || '/',
    );
    let resourceId = resource.id;
    if (!resourceId || resourceId === SHARE_ROOT_ID) {
      resourceId = share.resourceId;
    }
    const { resources, total } =
      await this.sharedResourcesService.resourceFilter(
        share,
        resourceId,
        requestDto.options,
      );
    const resourceIds = resources.map((r) => r.id);
    const pathMap = await this.sharedResourcesService.batchGetResourcePath(
      share,
      resourceIds,
    );
    const fileInfos = resources.map((resource) => {
      const resourcePath = pathMap.get(resource.id)!;
      const nameSegments = resourcePath.map((r) =>
        FileInfoDto.getName(r.name, r.id),
      );
      const parentPath =
        nameSegments.length > 1
          ? `/share/${nameSegments.slice(0, -1).join('/')}`
          : '/share';
      const fileInfo = FileInfoDto.fromSharedResourceMetaDto(
        resource,
        resource.parentId || SHARE_ROOT_ID,
        parentPath,
      );
      return fileInfo;
    });
    return { resources: fileInfos, total };
  }

  async getPathByResourceId(
    share: Share,
    resourceId: string,
  ): Promise<{ path: string }> {
    if (!resourceId) {
      throw new AppException(
        'resource_id is required',
        'RESOURCE_ID_REQUIRED',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (resourceId === SHARE_ROOT_ID) {
      return { path: '/share' };
    }

    const sharedResource = await this.sharedResourcesService.getSharedResource(
      share,
      resourceId,
    );
    if (resourceId === share.resourceId) {
      return {
        path: `/share/${FileInfoDto.getName(
          sharedResource.name,
          sharedResource.id,
        )}`,
      };
    }
    const path = sharedResource.path
      .map((item) => FileInfoDto.getName(item.name, item.id))
      .join('/');
    return { path: `/share/${path}` };
  }

  private async resolveChildren(
    share: Share,
    parent: FileInfoDto,
  ): Promise<FileInfoDto[]> {
    const path = parent.path!;

    if (path === '/') {
      return [await this.resolveResourceByPath(share, '/share')];
    }

    if (path === '/share') {
      const root = await this.sharedResourcesService.getAndValidateResourceMeta(
        share,
        share.resourceId,
      );
      const rootFileInfo = FileInfoDto.fromSharedResourceMetaDto(
        root,
        parent.id,
        parent.path!,
      );
      return [rootFileInfo];
    }

    const children =
      await this.sharedResourcesService.getSharedResourceChildren(
        share,
        parent.id,
      );
    const sortedChildren = children.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    return sortedChildren.map((resource) =>
      FileInfoDto.fromSharedResourceMetaDto(resource, parent.id, parent.path!),
    );
  }

  private async resolveResourceByPath(
    share: Share,
    path: string,
  ): Promise<FileInfoDto> {
    if (path === '/') {
      const fileInfo = new FileInfoDto();
      fileInfo.id = '';
      fileInfo.parentId = '';
      fileInfo.name = '';
      fileInfo.path = '/';
      fileInfo.type = ResourceType.FOLDER;
      fileInfo.hasChildren = true;
      return fileInfo;
    }

    if (path === '/share') {
      const fileInfo = new FileInfoDto();
      fileInfo.id = SHARE_ROOT_ID;
      fileInfo.parentId = '';
      fileInfo.name = 'share';
      fileInfo.path = '/share';
      fileInfo.type = ResourceType.FOLDER;
      fileInfo.hasChildren = true;
      return fileInfo;
    }

    let parsedPath: ShareParsedPathDo;
    try {
      parsedPath = ShareParsedPathDo.fromPath(path);
    } catch (err) {
      throw new AppException(
        err.message,
        'INVALID_PATH',
        HttpStatus.BAD_REQUEST,
      );
    }
    const root = await this.sharedResourcesService.getAndValidateResourceMeta(
      share,
      share.resourceId,
    );
    const rootFileInfo = FileInfoDto.fromSharedResourceMetaDto(
      root,
      SHARE_ROOT_ID,
      '/share',
    );

    let idx = 0;
    let curFiles = [rootFileInfo];
    while (idx < parsedPath.resourceNames.length) {
      const name = parsedPath.resourceNames[idx];
      const file = curFiles.find(
        (file) => FileInfoDto.getName(file.name ?? '', file.id) === name,
      );
      if (!file) {
        break;
      }
      if (idx === parsedPath.resourceNames.length - 1) {
        return file;
      }
      const children =
        await this.sharedResourcesService.getSharedResourceChildren(
          share,
          file.id,
        );
      curFiles = children.map((r) =>
        FileInfoDto.fromSharedResourceMetaDto(r, file.id, file.path!),
      );
      idx++;
    }
    throw new AppException(
      'Resource not found',
      'RESOURCE_NOT_FOUND',
      HttpStatus.NOT_FOUND,
    );
  }
}
