import { Expose } from 'class-transformer';

export class StorageUsageBreakdownDto {
  count: number;
  bytes: number;
}

export class StorageUsageResponseDto {
  @Expose({ name: 'total_bytes' })
  totalBytes: number;

  breakdown: {
    files: StorageUsageBreakdownDto;
    attachments: StorageUsageBreakdownDto;
    contents: StorageUsageBreakdownDto;
  };
}
