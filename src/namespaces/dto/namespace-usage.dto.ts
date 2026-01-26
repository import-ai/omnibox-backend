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
}
