import { Resource } from '../entities/resource.entity';
import { Expose } from 'class-transformer';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';

export class ResourceMetaDto {
  @Expose()
  id: string;

  @Expose({ name: 'parent_id' })
  parentId: string | null;

  @Expose()
  name: string;

  @Expose({ name: 'resource_type' })
  resourceType: string;

  createdAt: string;

  updatedAt: string;

  globalPermission: ResourcePermission | null;

  static fromEntity(resource: Resource) {
    const dto = new ResourceMetaDto();
    dto.id = resource.id;
    dto.parentId = resource.parentId;
    dto.name = resource.name;
    dto.resourceType = resource.resourceType;
    dto.createdAt = resource.createdAt.toISOString();
    dto.updatedAt = resource.updatedAt.toISOString();
    dto.globalPermission = resource.globalPermission;
    return dto;
  }
}
