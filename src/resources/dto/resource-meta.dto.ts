import { Resource, ResourceType } from '../entities/resource.entity';
import { Exclude, Expose, Transform } from 'class-transformer';
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
  @Transform(({ value }) => value.toISOString())
  createdAt: Date;

  @Expose({ name: 'updated_at' })
  @Transform(({ value }) => value.toISOString())
  updatedAt: Date;

  @Expose({ name: 'attrs' })
  attrs: Record<string, any>;

  @Expose({ name: 'content' })
  content: string;
  fileId: string | null;

  static fromEntity(resource: Resource) {
    const dto = new ResourceMetaDto();
    dto.id = resource.id;
    dto.parentId = resource.parentId;
    dto.name = resource.name;
    dto.resourceType = resource.resourceType;
    dto.globalPermission = resource.globalPermission;
    dto.createdAt = resource.createdAt;
    dto.updatedAt = resource.updatedAt;
    dto.attrs = resource.attrs;
    dto.content = resource.content;
    dto.fileId = resource.fileId;
    return dto;
  }
}
