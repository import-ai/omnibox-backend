import { Expose } from 'class-transformer';

export class NamespaceUsageDto {
  @Expose({ name: 'storage_quota' })
  storageQuota: number;

  @Expose({ name: 'storage_usage' })
  storageUsage: number;

  @Expose({ name: 'task_priority' })
  taskPriority: number;

  @Expose({ name: 'task_parallelism' })
  taskParallelism: number;

  @Expose({ name: 'file_upload_size_limit' })
  fileUploadSizeLimit: number;

  @Expose({ name: 'trash_retention_days' })
  trashRetentionDays: number;

  @Expose({ name: 'open_api_requests_per_24h' })
  openApiRequestsPer24h: number;

  @Expose({ name: 'readonly' })
  readonly: boolean;

  @Expose({ name: 'smart_folder_private_limit' })
  smartFolderPrivateLimit?: number;

  @Expose({ name: 'smart_folder_team_limit' })
  smartFolderTeamLimit?: number;

  @Expose({ name: 'smart_folder_rule_limit' })
  smartFolderRuleLimit?: number;
}
