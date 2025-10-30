import { Expose } from 'class-transformer';

export class FileInfoDto {
  @Expose()
  id: string;

  @Expose()
  url: string;

  static new(id: string, url: string) {
    const dto = new FileInfoDto();
    dto.id = id;
    dto.url = url;
    return dto;
  }
}
