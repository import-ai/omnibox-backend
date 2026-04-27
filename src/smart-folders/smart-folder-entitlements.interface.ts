import { SmartFolderEntitlementsResponseDto } from 'omniboxd/smart-folders/dto/smart-folder-entitlements-response.dto';

export const SMART_FOLDER_ENTITLEMENTS_PROVIDER = Symbol(
  'SMART_FOLDER_ENTITLEMENTS_PROVIDER',
);

export interface ISmartFolderEntitlementsProvider {
  getEntitlements(
    namespaceId: string,
    userId: string,
  ): Promise<SmartFolderEntitlementsResponseDto>;
}
