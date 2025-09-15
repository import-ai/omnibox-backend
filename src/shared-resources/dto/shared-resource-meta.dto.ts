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

  static fromEntity(resource: Resource): SharedResourceMetaDto {
    const dto = new SharedResourceMetaDto();
    dto.id = resource.id;
    dto.name = resource.name;
    dto.resourceType = resource.resourceType;
    dto.createdAt = resource.createdAt;
    dto.updatedAt = resource.updatedAt;
    return dto;
  }

  static fromResourceMeta(resource: ResourceMetaDto): SharedResourceMetaDto {
    const dto = new SharedResourceMetaDto();
    dto.id = resource.id;
    dto.name = resource.name;
    dto.resourceType = resource.resourceType;
    dto.createdAt = resource.createdAt;
    dto.updatedAt = resource.updatedAt;
    return dto;
  }
}
