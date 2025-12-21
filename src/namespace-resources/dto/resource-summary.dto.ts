import { Expose, Transform } from 'class-transformer';
import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';

export class ResourceSummaryDto {
  @Expose()
  id: string;

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

  @Expose({ name: 'created_at' })
  @Transform(({ value }) => value.toISOString())
  createdAt: Date;

  @Expose({ name: 'updated_at' })
  @Transform(({ value }) => value.toISOString())
  updatedAt: Date;

  static fromEntity(
    resource: Resource,
    hasChildren: boolean,
  ): ResourceSummaryDto {
    const dto = new ResourceSummaryDto();
    dto.id = resource.id;
    dto.name = resource.name;
    dto.resourceType = resource.resourceType;
    dto.attrs = { ...resource.attrs };
    delete dto.attrs.transcript;
    delete dto.attrs.video_info;
    // Content prefix: strip images and take first 100 chars
    const contentWithoutImages = (resource.content || '')
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/<img[^>]*>/gi, '')
      .trim();
    dto.content = contentWithoutImages.slice(0, 100);
    dto.hasChildren = hasChildren;
    dto.createdAt = resource.createdAt;
    dto.updatedAt = resource.updatedAt;
    return dto;
  }
}
