import { Expose } from 'class-transformer';

export class FileInfoDto {
  @Expose()
  id: string;

  @Expose()
  url: string;

  @Expose({ name: 'put_headers' })
  putHeaders: Record<string, string>;

  static new(id: string, url: string, putHeaders: Headers) {
    const dto = new FileInfoDto();
    dto.id = id;
    dto.url = url;
    dto.putHeaders = {};
    for (const [key, val] of putHeaders.entries()) {
      dto.putHeaders[key] = val;
    }
    return dto;
  }
}
