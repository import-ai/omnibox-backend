import { Expose } from 'class-transformer';

export class FileInfoDto {
  @Expose()
  url: string;

  @Expose({ name: 'put_headers' })
  putHeaders: Record<string, string>;

  static new(url: string, headers: Headers) {
    const dto = new FileInfoDto();
    dto.url = url;
    dto.putHeaders = {};
    for (const [key, val] of headers.entries()) {
      dto.putHeaders[key] = val;
    }
    return dto;
  }
}
