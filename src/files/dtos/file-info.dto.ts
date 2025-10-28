import { Expose } from 'class-transformer';

export class FileInfoDto {
  @Expose()
  url: string;

  @Expose({ name: 'upload_headers' })
  uploadHeaders: Record<string, string>;

  static new(url: string, headers: Headers) {
    const dto = new FileInfoDto();
    dto.url = url;
    dto.uploadHeaders = {};
    for (const [key, val] of headers.entries()) {
      headers[key] = val;
    }
    return dto;
  }
}
