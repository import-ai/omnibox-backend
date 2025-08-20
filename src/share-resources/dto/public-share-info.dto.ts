import { Share } from 'omniboxd/shares/entities/share.entity';
import { ShareResourceMetaDto } from './share-resource-meta.dto';
import { Resource } from 'omniboxd/resources/resources.entity';

export class PublicShareInfoDto {
  id: string;
  allResources: boolean;
  resource: ShareResourceMetaDto;

  static fromEntity(share: Share, resource: Resource): PublicShareInfoDto {
    const dto = new PublicShareInfoDto();
    dto.id = share.id;
    dto.allResources = share.allResources;
    dto.resource = ShareResourceMetaDto.fromEntity(resource);
    return dto;
  }
}
