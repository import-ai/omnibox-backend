import { Expose } from 'class-transformer';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';
import { TagDto } from 'omniboxd/tag/dto/tag.dto';
import { ResourceMetaDto } from 'omniboxd/resources/dto/resource-meta.dto';

export class InternalResourceDto {
  @Expose()
  id: string;

  @Expose({ name: 'namespace_id' })
  namespaceId: string;

  @Expose({ name: 'parent_id' })
  parentId: string | null;

  @Expose()
  name: string;

  @Expose({ name: 'resource_type' })
  resourceType: ResourceType;

  @Expose()
  content: string;

  @Expose()
  tags: TagDto[];

  @Expose()
  attrs: Record<string, any>;

  @Expose({ name: 'global_permission' })
  globalPermission: ResourcePermission | null;

  @Expose()
  path: ResourceMetaDto[];

  @Expose({ name: 'created_at' })
  createdAt: string;

  @Expose({ name: 'updated_at' })
  updatedAt: string;

  static fromEntity(
    resource: Resource,
    path: ResourceMetaDto[],
    tags: TagDto[] = [],
  ) {
    const dto = new InternalResourceDto();
    dto.id = resource.id;
    dto.namespaceId = resource.namespaceId;
    dto.parentId = resource.parentId;
    dto.name = resource.name;
    dto.resourceType = resource.resourceType;
    dto.content = resource.content;
    dto.tags = tags;
    dto.attrs = resource.attrs;
    dto.globalPermission = resource.globalPermission;
    dto.path = path;
    dto.createdAt = resource.createdAt.toISOString();
    dto.updatedAt = resource.updatedAt.toISOString();
    return dto;
  }
}
