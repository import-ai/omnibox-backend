import { Expose } from 'class-transformer';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import {
  isReadOnlyResourceType,
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';
import { TagDto } from 'omniboxd/tag/dto/tag.dto';

import { BreadcrumbItemDto } from './breadcrumb-item.dto';

export enum SpaceType {
  PRIVATE = 'private',
  TEAM = 'teamspace',
}

export class ResourceDto {
  id: string;
  namespace_id: string;
  parent_id: string | null;
  name: string;
  resource_type: ResourceType;
  content: string;
  tags: TagDto[];
  attrs: Record<string, any>;
  global_permission: ResourcePermission | null;
  current_permission: ResourcePermission;
  path: BreadcrumbItemDto[];
  space_type: SpaceType;
  // Derived from the resource type: true for resources the product writes and
  // the user may only read (rss items today). Lets clients gate edit/move/
  // delete/duplicate generically instead of type-matching.
  @Expose({ name: 'read_only' })
  readOnly: boolean;
  created_at: string;
  updated_at: string;

  static fromEntity(
    resource: Resource,
    currentPermission: ResourcePermission,
    path: BreadcrumbItemDto[],
    spaceType: SpaceType,
    tags: TagDto[] = [],
  ) {
    const dto = new ResourceDto();
    dto.id = resource.id;
    dto.namespace_id = resource.namespaceId;
    dto.parent_id = resource.parentId;
    dto.name = resource.name;
    dto.resource_type = resource.resourceType;
    dto.content = resource.content;
    dto.tags = tags;
    dto.attrs = resource.attrs;
    dto.global_permission = resource.globalPermission;
    dto.current_permission = currentPermission;
    dto.path = path;
    dto.space_type = spaceType;
    dto.readOnly = isReadOnlyResourceType(resource.resourceType);
    dto.created_at = resource.createdAt.toISOString();
    dto.updated_at = resource.updatedAt.toISOString();
    return dto;
  }
}
