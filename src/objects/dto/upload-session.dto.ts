import { Expose } from 'class-transformer';

export class UploadSessionDto {
  @Expose({ name: 'access_key_id' })
  accessKeyId: string;

  @Expose({ name: 'access_key_secret' })
  accessKeySecret: string;

  @Expose({ name: 'security_token' })
  securityToken: string;

  @Expose()
  bucket: string;

  @Expose()
  path: string;
}
