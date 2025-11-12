import { Expose } from 'class-transformer';

export class FileInfoDto {
  @Expose()
  id: string;

  @Expose({ name: 'post_url' })
  postUrl?: string;

  @Expose({ name: 'post_fields' })
  postFields?: [string, string][];

  static new(
    id: string,
    postUrl?: string,
    postFields?: Record<string, string>,
  ) {
    const dto = new FileInfoDto();
    dto.id = id;
    dto.postUrl = postUrl;
    if (postFields) {
      dto.postFields = Object.entries(postFields);
    }
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
