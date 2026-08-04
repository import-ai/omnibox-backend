import {
  ResourceSortBy,
  ResourceSortOrder,
} from 'omniboxd/resources/resource-sort';

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
  sortBy: ResourceSortBy;
  sortOrder: ResourceSortOrder;
  manualSortAvailable: boolean;

  static new(namespaceId: string, resourceId: string): ShareInfoDto {
    const dto = new ShareInfoDto();
    dto.id = '';
    dto.namespaceId = namespaceId;
    dto.resourceId = resourceId;
    dto.enabled = false;
    dto.allResources = false;
    dto.requireLogin = false;
    dto.passwordEnabled = false;
    dto.shareType = ShareType.DOC_ONLY;
    dto.expiresAt = null;
    dto.sortBy = ResourceSortBy.UPDATED_AT;
    dto.sortOrder = ResourceSortOrder.DESC;
    dto.manualSortAvailable = false;
    return dto;
  }

  static fromEntity(
    share: Share,
    manualSortAvailable: boolean = false,
  ): ShareInfoDto {
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
    dto.sortBy = share.sortBy;
    dto.sortOrder = share.sortOrder;
    dto.manualSortAvailable = manualSortAvailable;
    return dto;
  }
}
