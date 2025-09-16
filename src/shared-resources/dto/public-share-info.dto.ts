import { Share } from 'omniboxd/shares/entities/share.entity';
import { SharedResourceMetaDto } from './shared-resource-meta.dto';

export class PublicShareInfoDto {
  id: string;
  allResources: boolean;
  resource: SharedResourceMetaDto;

  static fromResourceMeta(
    share: Share,
    resource: SharedResourceMetaDto,
  ): PublicShareInfoDto {
    const dto = new PublicShareInfoDto();
    dto.id = share.id;
    dto.allResources = share.allResources;
    dto.resource = resource;
    return dto;
  }
}
