import { Expose } from 'class-transformer';
import { ResourceSummaryDto } from 'omniboxd/namespace-resources/dto/resource-summary.dto';
import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';
import { InternalResourceDto } from 'omniboxd/namespace-resources/dto/internal-resource.dto';
import { ResourceMetaDto } from 'omniboxd/resources/dto/resource-meta.dto';

export class FileInfoDto {
  id: string;

  @Expose({ name: 'parent_id' })
  parentId?: string | null;

  name?: string;

  path?: string;

  size?: string;

  @Expose({ name: 'created_at' })
  createdAt: string;

  @Expose({ name: 'updated_at' })
  updatedAt: string;

  @Expose({ name: 'is_dir' })
  isDir: boolean;

  @Expose({ name: 'mime_type' })
  mimeType?: string;

  static getName(
    resourceName: string,
    resourceId: string,
    getDir: boolean,
  ): string {
    if (resourceName === '') {
      resourceName = `Untitled-${resourceId}`;
    }
    if (!getDir) {
      resourceName = `${resourceName}.md`;
    }
    return resourceName;
  }

  static isDir(resource: ResourceSummaryDto): boolean {
    return (
      resource.hasChildren || resource.resourceType === ResourceType.FOLDER
    );
  }

  static fromResource(
    resource: Resource,
    path: string,
    getDir: boolean,
  ): FileInfoDto {
    const dto = new FileInfoDto();
    dto.id = resource.id;
    dto.parentId = resource.parentId;
    dto.name = FileInfoDto.getName(resource.name, resource.id, getDir);
    dto.path = path;
    dto.createdAt = resource.createdAt.toISOString();
    dto.updatedAt = resource.updatedAt.toISOString();
    dto.isDir = getDir;
    return dto;
  }

  static fromRootResourceMetoDto(
    name: string,
    resource: ResourceMetaDto,
  ): FileInfoDto {
    const dto = new FileInfoDto();
    dto.id = resource.id;
    dto.parentId = resource.parentId;
    dto.name = name;
    dto.path = `/${name}`;
    dto.createdAt = resource.createdAt.toISOString();
    dto.updatedAt = resource.updatedAt.toISOString();
    dto.isDir = true;
    return dto;
  }

  static fromInternalResourceDto(
    resource: InternalResourceDto,
    path: string,
    getDir: boolean,
  ): FileInfoDto {
    const dto = new FileInfoDto();
    dto.id = resource.id;
    dto.parentId = resource.parentId;
    dto.name = FileInfoDto.getName(resource.name, resource.id, getDir);
    dto.path = path;
    dto.createdAt = resource.createdAt;
    dto.updatedAt = resource.updatedAt;
    dto.isDir = getDir;
    return dto;
  }

  static fromResourceSummaryDto(
    resource: ResourceSummaryDto,
    getDir: boolean,
    parentPath?: string,
  ): FileInfoDto {
    const dto = new FileInfoDto();
    dto.id = resource.id;
    dto.parentId = resource.parentId;
    dto.name = FileInfoDto.getName(resource.name, resource.id, getDir);
    if (parentPath) {
      dto.path = `${parentPath}/${dto.name}`;
    }
    dto.createdAt = resource.createdAt.toISOString();
    dto.updatedAt = resource.updatedAt.toISOString();
    if (!FileInfoDto.isDir(resource) && getDir) {
      throw new Error(`${resource.id} is not a directory`);
    }
    dto.isDir = getDir;
    return dto;
  }
}
