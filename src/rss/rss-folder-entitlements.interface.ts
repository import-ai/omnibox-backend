import { RssFolderEntitlementsResponseDto } from 'omniboxd/rss/dto/rss-folder-entitlements-response.dto';

export const RSS_FOLDER_ENTITLEMENTS_PROVIDER = Symbol(
  'RSS_FOLDER_ENTITLEMENTS_PROVIDER',
);

export interface IRssFolderEntitlementsProvider {
  getEntitlements(
    namespaceId: string,
    userId: string,
  ): Promise<RssFolderEntitlementsResponseDto>;
}
