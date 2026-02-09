import { Expose, Transform } from 'class-transformer';
import { ResourceMetaDto } from 'omniboxd/resources/dto/resource-meta.dto';
import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';

export class SharedResourceMetaDto {
  @Expose()
  id: string;

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

  @Expose()
  url?: string;

  static fromEntity(resource: Resource): SharedResourceMetaDto {
    const dto = new SharedResourceMetaDto();
    dto.id = resource.id;
    dto.name = resource.name;
    dto.resourceType = resource.resourceType;
    dto.createdAt = resource.createdAt;
    dto.updatedAt = resource.updatedAt;
    dto.url = resource.attrs?.url;
    return dto;
  }

  static fromResourceMeta(
    resource: ResourceMetaDto,
    hasChildren?: boolean,
  ): SharedResourceMetaDto {
    const dto = new SharedResourceMetaDto();
    dto.id = resource.id;
    dto.name = resource.name;
    dto.resourceType = resource.resourceType;
    dto.createdAt = resource.createdAt;
    dto.updatedAt = resource.updatedAt;
    dto.hasChildren = hasChildren;
    dto.url = resource.attrs?.url;
    return dto;
  }
}
