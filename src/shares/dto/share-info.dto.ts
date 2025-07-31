import { Share, ShareType } from '../entities/share.entity';

export class ShareInfoDto {
  id: string;
  namespaceId: string;
  resourceId: string;
  enabled: boolean;
  requireLogin: boolean;
  passwordEnabled: boolean;
  shareType: ShareType;
  expiresAt: Date | null;

  static fromEntity(share: Share | null): ShareInfoDto {
    if (!share) {
      return new ShareInfoDto();
    }
    const dto = new ShareInfoDto();
    dto.id = share.id;
    dto.namespaceId = share.namespaceId;
    dto.resourceId = share.resourceId;
    dto.enabled = share.enabled;
    dto.requireLogin = share.requireLogin;
    dto.passwordEnabled = !!share.password;
    dto.shareType = share.shareType;
    dto.expiresAt = share.expiresAt;
    return dto;
  }
}
