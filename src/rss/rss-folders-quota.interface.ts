export const RSS_FOLDERS_QUOTA_SERVICE = Symbol('RSS_FOLDERS_QUOTA_SERVICE');

export interface IRssFoldersQuotaService {
  assertRestoreQuota(
    namespaceId: string,
    userId: string,
    resourceId: string,
  ): Promise<void>;
}
