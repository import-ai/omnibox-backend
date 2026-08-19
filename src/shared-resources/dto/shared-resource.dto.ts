import { BreadcrumbItemDto } from 'omniboxd/namespace-resources/dto/breadcrumb-item.dto';
import {
  isReadOnlyResourceType,
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';
import { TagDto } from 'omniboxd/tag/dto/tag.dto';

export class SharedResourceDto {
  id: string;
  name: string;
  resource_type: ResourceType;
  content: string;
  tags: TagDto[];
  path: BreadcrumbItemDto[];
  attrs: Record<string, any>;
  // Same flag as ResourceDto: a share viewer must gate its actions on the
  // resource, not on its type.
  read_only: boolean;
  created_at: string;
  updated_at: string;

  static fromEntity(
    resource: Resource,
    tags: TagDto[] = [],
    path: BreadcrumbItemDto[] = [],
  ) {
    const dto = new SharedResourceDto();
    dto.id = resource.id;
    dto.name = resource.name;
    dto.resource_type = resource.resourceType;
    dto.content = resource.content;
    dto.tags = tags;
    dto.path = path;
    dto.attrs = resource.attrs;
    dto.read_only = isReadOnlyResourceType(resource.resourceType);
    dto.created_at = resource.createdAt.toISOString();
    dto.updated_at = resource.updatedAt.toISOString();
    return dto;
  }
}
