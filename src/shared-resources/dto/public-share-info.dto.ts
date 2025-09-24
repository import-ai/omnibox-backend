import { Expose } from 'class-transformer';
import { Share, ShareType } from 'omniboxd/shares/entities/share.entity';
import { SharedResourceMetaDto } from './shared-resource-meta.dto';

export class PublicShareInfoDto {
  @Expose()
  id: string;

  @Expose({ name: 'all_resources' })
  allResources: boolean;

  @Expose({ name: 'share_type' })
  shareType: ShareType;

  @Expose({ name: 'namespace_name' })
  namespaceName: string;

  @Expose()
  resource: SharedResourceMetaDto;

  static fromResourceMeta(
    share: Share,
    resource: SharedResourceMetaDto,
    namespaceName: string,
  ): PublicShareInfoDto {
    const dto = new PublicShareInfoDto();
    dto.id = share.id;
    dto.allResources = share.allResources;
    dto.shareType = share.shareType;
    dto.namespaceName = namespaceName;
    dto.resource = resource;
    return dto;
  }
}
