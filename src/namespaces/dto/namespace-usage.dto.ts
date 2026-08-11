import { Expose } from 'class-transformer';

export class NamespaceUsageDto {
  @Expose({ name: 'storage_quota' })
  storageQuota: number = 0;

  @Expose({ name: 'storage_usage' })
  storageUsage: number = 0;

  @Expose({ name: 'task_priority' })
  taskPriority: number = 1;

  @Expose({ name: 'task_parallelism' })
  taskParallelism: number = 1;

  @Expose({ name: 'file_upload_size_limit' })
  fileUploadSizeLimit: number = 20 * 1024 * 1024; // 20MB

  @Expose({ name: 'trash_retention_days' })
  trashRetentionDays: number = 7;

  @Expose({ name: 'open_api_requests_per_24h' })
  openApiRequestsPer24h: number = 0;

  @Expose({ name: 'readonly' })
  readonly: boolean = false;

  @Expose({ name: 'smart_folder_private_limit' })
  smartFolderPrivateLimit: number = 1;

  @Expose({ name: 'smart_folder_team_limit' })
  smartFolderTeamLimit: number = 1;

  @Expose({ name: 'smart_folder_rule_limit' })
  smartFolderRuleLimit: number = 3;

  @Expose({ name: 'rss_link_limit' })
  rssLinkLimit: number = 1;

  @Expose({ name: 'rss_folder_private_limit' })
  rssFolderPrivateLimit: number = 1;

  @Expose({ name: 'rss_folder_team_limit' })
  rssFolderTeamLimit: number = 1;
}
