import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import { Resource } from 'omniboxd/resources/entities/resource.entity';

export class SharedResourceDto {
  id: string;
  name: string;
  resource_type: ResourceType;
  content: string;
  attrs: Record<string, any>;
  created_at: string;
  updated_at: string;

  static fromEntity(resource: Resource) {
    const dto = new SharedResourceDto();
    dto.id = resource.id;
    dto.name = resource.name;
    dto.resource_type = resource.resourceType;
    dto.content = resource.content;
    dto.attrs = resource.attrs;
    dto.created_at = resource.createdAt.toISOString();
    dto.updated_at = resource.updatedAt.toISOString();
    return dto;
  }
}
