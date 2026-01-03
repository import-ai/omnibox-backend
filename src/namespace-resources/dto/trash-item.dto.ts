import { Expose, Transform } from 'class-transformer';
import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';

export class TrashItemDto {
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

  @Expose({ name: 'deleted_at' })
  @Transform(({ value }) => value?.toISOString())
  deletedAt: Date;

  static fromEntity(resource: Resource): TrashItemDto {
    const dto = new TrashItemDto();
    dto.id = resource.id;
    dto.parentId = resource.parentId;
    dto.name = resource.name;
    dto.resourceType = resource.resourceType;
    dto.attrs = { ...resource.attrs };
    delete dto.attrs.transcript;
    delete dto.attrs.video_info;
    dto.deletedAt = resource.deletedAt!;
    return dto;
  }
}
