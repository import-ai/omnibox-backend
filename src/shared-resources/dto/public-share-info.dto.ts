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

  // Absent on a chat-only share: the root resource's name and timestamps are
  // resource data, and that share serves none to its visitors.
  @Expose()
  resource?: SharedResourceMetaDto;

  @Expose()
  username: string;

  static fromResourceMeta(
    share: Share,
    resource: SharedResourceMetaDto | undefined,
    username: string,
  ): PublicShareInfoDto {
    const dto = new PublicShareInfoDto();
    dto.id = share.id;
    dto.allResources = share.allResources;
    dto.shareType = share.shareType;
    dto.resource = resource;
    dto.username = username;
    return dto;
  }
}
