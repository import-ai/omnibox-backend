import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';
import { Exclude, Expose } from 'class-transformer';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';

export class ResourceMetaDto {
  @Expose()
  id: string;

  @Expose({ name: 'parent_id' })
  parentId: string | null;

  @Expose()
  name: string;

  @Expose({ name: 'resource_type' })
  resourceType: ResourceType;

  @Exclude()
  globalPermission: ResourcePermission | null;

  @Expose({ name: 'created_at' })
  createdAt: string;

  @Expose({ name: 'updated_at' })
  updatedAt: string;

  @Expose({ name: 'attrs' })
  attrs: Record<string, any>;

  static fromEntity(resource: Resource) {
    const dto = new ResourceMetaDto();
    dto.id = resource.id;
    dto.parentId = resource.parentId;
    dto.name = resource.name;
    dto.resourceType = resource.resourceType;
    dto.globalPermission = resource.globalPermission;
    dto.createdAt = resource.createdAt.toISOString();
    dto.updatedAt = resource.updatedAt.toISOString();
    dto.attrs = resource.attrs;
    return dto;
  }
}
