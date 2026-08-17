import { Expose, Transform } from 'class-transformer';
import { ResourceMetaDto } from 'omniboxd/resources/dto/resource-meta.dto';
import {
  isReadOnlyResourceType,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';
import { Share } from 'omniboxd/shares/entities/share.entity';

export class SharedResourceMetaDto {
  @Expose()
  id: string;

  @Expose({ name: 'parent_id' })
  parentId: string | null;

  @Expose()
  name: string;

  @Expose({ name: 'resource_type' })
  resourceType: ResourceType;

  @Expose({ name: 'created_at' })
  @Transform(({ value }) => value.toISOString())
  createdAt: Date;

  @Expose({ name: 'updated_at' })
  @Transform(({ value }) => value.toISOString())
  updatedAt: Date;

  @Expose({ name: 'has_children' })
  hasChildren?: boolean;

  // Same flag as ResourceSummaryDto: a share listing must gate its row actions
  // on the resource, not on its type.
  @Expose({ name: 'read_only' })
  readOnly: boolean;

  @Expose()
  attrs?: Record<string, any>;

  static fromResourceMeta(
    share: Share,
    resource: ResourceMetaDto,
    hasChildren?: boolean,
  ): SharedResourceMetaDto {
    const dto = new SharedResourceMetaDto();
    dto.id = resource.id;
    dto.parentId = resource.id === share.resourceId ? null : resource.parentId;
    dto.name = resource.name;
    dto.resourceType = resource.resourceType;
    dto.createdAt = resource.createdAt;
    dto.updatedAt = resource.updatedAt;
    dto.hasChildren = hasChildren;
    dto.readOnly = isReadOnlyResourceType(resource.resourceType);
    dto.attrs = resource.attrs;
    delete dto.attrs.transcript;
    delete dto.attrs.video_info;
    return dto;
  }
}
