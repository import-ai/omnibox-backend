import { Expose } from 'class-transformer';
import { ResourceSummaryDto } from 'omniboxd/namespace-resources/dto/resource-summary.dto';
import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';
import { InternalResourceDto } from 'omniboxd/namespace-resources/dto/internal-resource.dto';
import { ResourceMetaDto } from 'omniboxd/resources/dto/resource-meta.dto';
import { SpaceType } from 'omniboxd/namespace-resources/dto/resource.dto';

export class FileInfoDto {
  id: string;

  @Expose({ name: 'parent_id' })
  parentId?: string | null;

  name?: string;

  path?: string;

  @Expose({ name: 'is_folder' })
  isFolder: boolean;

  @Expose({ name: 'has_children' })
  hasChildren: boolean;

  static getName(resourceName: string, resourceId: string): string {
    if (resourceName === '') {
      resourceName = `Untitled-${resourceId}`;
    }
    return resourceName;
  }

  static fromResource(
    resource: Resource | InternalResourceDto,
    path: string,
    hasChildren: boolean,
  ): FileInfoDto {
    const dto = new FileInfoDto();
    dto.id = resource.id;
    dto.parentId = resource.parentId;
    dto.name = FileInfoDto.getName(resource.name, resource.id);
    dto.path = path;
    dto.isFolder = resource.resourceType === ResourceType.FOLDER;
    dto.hasChildren = hasChildren;
    return dto;
  }

  static fromRootResourceMetoDto(
    spaceType: SpaceType,
    resource: ResourceMetaDto,
    hasChildren: boolean,
  ): FileInfoDto {
    const dto = new FileInfoDto();
    dto.id = resource.id;
    dto.parentId = resource.parentId;
    dto.name = spaceType;
    dto.path = `/${spaceType}`;
    dto.isFolder = resource.resourceType === ResourceType.FOLDER;
    dto.hasChildren = hasChildren;
    return dto;
  }

  static fromResourceSummaryDto(
    resource: ResourceSummaryDto,
    parentPath?: string,
  ): FileInfoDto {
    const dto = new FileInfoDto();
    dto.id = resource.id;
    dto.parentId = resource.parentId;
    dto.name = FileInfoDto.getName(resource.name, resource.id);
    if (parentPath) {
      dto.path = `${parentPath}/${dto.name}`;
    }
    dto.isFolder = resource.resourceType === ResourceType.FOLDER;
    dto.hasChildren = resource.hasChildren;
    return dto;
  }
}
