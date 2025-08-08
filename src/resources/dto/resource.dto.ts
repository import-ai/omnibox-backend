import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { Resource, ResourceType } from '../resources.entity';

export enum SpaceType {
  PRIVATE = 'private',
  TEAM = 'teamspace',
}

export class ResourceMetaDto {
  id: string;
  name: string;
  resource_type: string;

  static fromEntity(resource: Resource) {
    const dto = new ResourceMetaDto();
    dto.id = resource.id;
    dto.name = resource.name;
    dto.resource_type = resource.resourceType;
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
  tags: string[];
  attrs: Record<string, any>;
  global_permission: ResourcePermission | null;
  current_permission: ResourcePermission;
  path: ResourceMetaDto[];
  space_type: SpaceType;

  static fromEntity(
    resource: Resource,
    currentPermission: ResourcePermission,
    path: ResourceMetaDto[],
    spaceType: SpaceType,
  ) {
    const dto = new ResourceDto();
    dto.id = resource.id;
    dto.namespace_id = resource.namespaceId;
    dto.parent_id = resource.parentId;
    dto.name = resource.name;
    dto.resource_type = resource.resourceType;
    dto.content = resource.content;
    dto.tags = resource.tags;
    dto.attrs = resource.attrs;
    dto.global_permission = resource.globalPermission;
    dto.current_permission = currentPermission;
    dto.path = path;
    dto.space_type = spaceType;
    return dto;
  }
}
