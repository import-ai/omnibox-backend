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

export class InternalFileInfoDto {
  @Expose({ name: 'public_url' })
  publicUrl: string;

  @Expose({ name: 'internal_url' })
  internalUrl: string;

  static new(publicUrl: string, internalUrl: string) {
    const dto = new InternalFileInfoDto();
    dto.publicUrl = publicUrl;
    dto.internalUrl = internalUrl;
    return dto;
  }
}
