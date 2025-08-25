import { Share } from 'omniboxd/shares/entities/share.entity';
import { SharedResourceMetaDto } from './shared-resource-meta.dto';
import { Resource } from 'omniboxd/namespace-resources/namespace-resources.entity';

export class PublicShareInfoDto {
  id: string;
  allResources: boolean;
  resource: SharedResourceMetaDto;

  static fromEntity(share: Share, resource: Resource): PublicShareInfoDto {
    const dto = new PublicShareInfoDto();
    dto.id = share.id;
    dto.allResources = share.allResources;
    dto.resource = SharedResourceMetaDto.fromEntity(resource);
    return dto;
  }
}
