import { Expose } from 'class-transformer';
import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class VfsCollectUrlRequestDto {
  @IsString()
  @Expose({ name: 'parent_path' })
  parentPath: string;

  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @IsNotEmpty()
  @IsString()
  @Expose({ name: 'url' })
  url: string;
}
