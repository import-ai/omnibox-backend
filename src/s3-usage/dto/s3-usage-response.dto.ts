export class S3UsageBreakdownDto {
  count: number;
  bytes: number;
}

export class S3UsageResponseDto {
  totalBytes: number;
  breakdown: {
    files: S3UsageBreakdownDto;
    attachments: S3UsageBreakdownDto;
  };
}
