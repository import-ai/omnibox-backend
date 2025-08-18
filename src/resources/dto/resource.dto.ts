import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { Resource, ResourceType } from '../resources.entity';
import { TagDto } from 'omniboxd/tag/dto/tag.dto';

export enum SpaceType {
  PRIVATE = 'private',
  TEAM = 'teamspace',
}

export class ResourceMetaDto {
  id: string;
  parent_id: string | null;
  name: string;
  resource_type: string;
  attrs: Record<string, any>;
  tags: TagDto[];
  created_at: string;
  updated_at: string;

  static fromEntity(resource: Resource, tags: TagDto[] = []) {
    const dto = new ResourceMetaDto();
    dto.id = resource.id;
    dto.parent_id = resource.parentId;
    dto.name = resource.name;
    dto.resource_type = resource.resourceType;
    dto.attrs = resource.attrs;
    dto.tags = tags;
    dto.created_at = resource.createdAt.toISOString();
    dto.updated_at = resource.updatedAt.toISOString();
    return dto;
  }
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
  path: ResourceMetaDto[];
  space_type: SpaceType;
  created_at: string;
  updated_at: string;

  static fromEntity(
    resource: Resource,
    currentPermission: ResourcePermission,
    path: ResourceMetaDto[],
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
    dto.created_at = resource.createdAt.toISOString();
    dto.updated_at = resource.updatedAt.toISOString();
    return dto;
  }
}
