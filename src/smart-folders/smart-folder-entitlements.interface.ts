import { SmartFolderEntitlementsResponseDto } from 'omniboxd/smart-folders/dto/smart-folder-entitlements-response.dto';
import { ResourceSummaryDto } from 'omniboxd/namespace-resources/dto/resource-summary.dto';

export const SMART_FOLDER_ENTITLEMENTS_PROVIDER = Symbol(
  'SMART_FOLDER_ENTITLEMENTS_PROVIDER',
);
export const SMART_FOLDERS_SERVICE = Symbol('SMART_FOLDERS_SERVICE');

export interface ISmartFolderEntitlementsProvider {
  getEntitlements(
    namespaceId: string,
    userId: string,
  ): Promise<SmartFolderEntitlementsResponseDto>;
}

export interface ISmartFoldersService {
  listChildren(
    userId: string,
    namespaceId: string,
    resourceId: string,
    options?: {
      limit?: number;
      offset?: number;
    },
  ): Promise<ResourceSummaryDto[]>;

  assertRestoreEntitlements(
    namespaceId: string,
    userId: string,
    resourceId: string,
  ): Promise<void>;
}
