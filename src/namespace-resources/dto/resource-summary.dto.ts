import { Expose, Transform } from 'class-transformer';
import { buildContentSnippet } from 'omniboxd/resources/content-snippet.util';
import {
  isReadOnlyResourceType,
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';

export class ResourceSummaryDto {
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

  @Expose()
  content: string;

  @Expose({ name: 'has_children' })
  hasChildren: boolean;

  // See ResourceDto.readOnly: lets a folder listing gate row actions without
  // knowing which types the product owns.
  @Expose({ name: 'read_only' })
  readOnly: boolean;

  @Expose({ name: 'created_at' })
  @Transform(({ value }) => value.toISOString())
  createdAt: Date;

  @Expose({ name: 'updated_at' })
  @Transform(({ value }) => value.toISOString())
  updatedAt: Date;

  @Expose({ name: 'first_attachment' })
  firstAttachment?: string;

  static fromEntity(
    resource: Resource,
    hasChildren: boolean,
    firstAttachment?: string,
  ): ResourceSummaryDto {
    const dto = new ResourceSummaryDto();
    dto.id = resource.id;
    dto.parentId = resource.parentId;
    dto.name = resource.name;
    dto.resourceType = resource.resourceType;
    dto.attrs = { ...resource.attrs };
    delete dto.attrs.transcript;
    delete dto.attrs.video_info;
    dto.content = buildContentSnippet(resource.content);
    dto.hasChildren = hasChildren;
    dto.readOnly = isReadOnlyResourceType(resource.resourceType);
    dto.createdAt = resource.createdAt;
    dto.updatedAt = resource.updatedAt;
    dto.firstAttachment = firstAttachment;
    return dto;
  }
}
