import { Resource, ResourceType } from 'omniboxd/resources/resources.entity';

export class ShareResourceMetaDto {
  id: string;
  name: string;
  resource_type: ResourceType;

  static fromEntity(resource: Resource): ShareResourceMetaDto {
    const dto = new ShareResourceMetaDto();
    dto.id = resource.id;
    dto.name = resource.name;
    dto.resource_type = resource.resourceType;
    return dto;
  }
}
