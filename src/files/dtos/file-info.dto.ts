import { Expose } from 'class-transformer';

export class FileInfoDto {
  @Expose()
  id: string;

  @Expose()
  url: string;

  @Expose()
  headers: Record<string, string>;

  static new(id: string, url: string, headers: Headers) {
    const dto = new FileInfoDto();
    dto.id = id;
    dto.url = url;
    dto.headers = {};
    for (const [key, val] of headers.entries()) {
      dto.headers[key] = val;
    }
    return dto;
  }
}
