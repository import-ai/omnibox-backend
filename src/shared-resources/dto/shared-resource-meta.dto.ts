import { Resource, ResourceType } from 'omniboxd/namespace-resources/namespace-resources.entity';

export class SharedResourceMetaDto {
  id: string;
  name: string;
  resource_type: ResourceType;

  static fromEntity(resource: Resource): SharedResourceMetaDto {
    const dto = new SharedResourceMetaDto();
    dto.id = resource.id;
    dto.name = resource.name;
    dto.resource_type = resource.resourceType;
    return dto;
  }
}
