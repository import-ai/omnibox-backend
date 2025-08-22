import { Share, ShareType } from '../entities/share.entity';

export class ShareInfoDto {
  id: string;
  namespaceId: string;
  resourceId: string;
  enabled: boolean;
  allResources: boolean;
  requireLogin: boolean;
  passwordEnabled: boolean;
  shareType: ShareType;
  expiresAt: Date | null;

  static new(namespaceId: string, resourceId: string): ShareInfoDto {
    const dto = new ShareInfoDto();
    dto.id = '';
    dto.namespaceId = namespaceId;
    dto.resourceId = resourceId;
    dto.enabled = false;
    dto.allResources = false;
    dto.requireLogin = false;
    dto.passwordEnabled = false;
    dto.shareType = ShareType.ALL;
    dto.expiresAt = null;
    return dto;
  }

  static fromEntity(share: Share): ShareInfoDto {
    const dto = new ShareInfoDto();
    dto.id = share.id;
    dto.namespaceId = share.namespaceId;
    dto.resourceId = share.resourceId;
    dto.enabled = share.enabled;
    dto.allResources = share.allResources;
    dto.requireLogin = share.requireLogin;
    dto.passwordEnabled = !!share.password;
    dto.shareType = share.shareType;
    dto.expiresAt = share.expiresAt;
    return dto;
  }
}
