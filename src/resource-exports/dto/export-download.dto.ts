import { Expose, Transform } from 'class-transformer';

export class ExportDownloadDto {
  @Expose({ name: 'download_url' })
  downloadUrl: string;

  @Expose({ name: 'expires_at' })
  @Transform(({ value }) => value?.toISOString())
  expiresAt: Date;

  static create(url: string, expiresAt: Date): ExportDownloadDto {
    const dto = new ExportDownloadDto();
    dto.downloadUrl = url;
    dto.expiresAt = expiresAt;
    return dto;
  }
}
