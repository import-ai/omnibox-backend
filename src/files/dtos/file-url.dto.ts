import { Expose } from 'class-transformer';

export class FileUrlDto {
  @Expose()
  url: string;

  @Expose()
  headers: Record<string, string>;

  static new(url: string, headers: Headers) {
    const dto = new FileUrlDto();
    dto.url = url;
    dto.headers = {};
    for (const [key, val] of headers.entries()) {
      headers[key] = val;
    }
    return dto;
  }
}
