export class StorageUsageBreakdownDto {
  count: number;
  bytes: number;
}

export class StorageUsageResponseDto {
  totalBytes: number;
  breakdown: {
    files: StorageUsageBreakdownDto;
    attachments: StorageUsageBreakdownDto;
    contents: StorageUsageBreakdownDto;
  };
}
