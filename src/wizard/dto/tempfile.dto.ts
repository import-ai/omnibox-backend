import { Expose } from 'class-transformer';

export class TempfileDto {
  @Expose({ name: 'upload_url' })
  uploadUrl: string;

  @Expose({ name: 'download_url' })
  downloadUrl: string;
}
