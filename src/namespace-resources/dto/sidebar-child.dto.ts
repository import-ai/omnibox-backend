import { Expose, Transform } from 'class-transformer';
import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';

export class SidebarChildDto {
  @Expose()
  id: string;

  @Expose({ name: 'parent_id' })
  parentId: string | null;

  @Expose()
  name: string;

  @Expose({ name: 'resource_type' })
  resourceType: ResourceType;

  @Expose()
  attrs: Record<string, any>;

  @Expose({ name: 'has_children' })
  hasChildren: boolean;

  @Expose({ name: 'created_at' })
  @Transform(({ value }) => value.toISOString())
  createdAt: Date;

  @Expose({ name: 'updated_at' })
  @Transform(({ value }) => value.toISOString())
  updatedAt: Date;

  static fromEntity(resource: Resource, hasChildren: boolean): SidebarChildDto {
    const dto = new SidebarChildDto();
    dto.id = resource.id;
    dto.parentId = resource.parentId;
    dto.name = resource.name;
    dto.resourceType = resource.resourceType;
    dto.attrs = { ...resource.attrs };
    delete dto.attrs.transcript;
    delete dto.attrs.video_info;
    dto.hasChildren = hasChildren;
    dto.createdAt = resource.createdAt;
    dto.updatedAt = resource.updatedAt;
    return dto;
  }
}
