import { Expose } from 'class-transformer';
import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class InternalCollectUrlRequestDto {
  @IsString()
  @IsNotEmpty()
  @Expose({ name: 'parent_id' })
  parentId: string;

  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: false,
  })
  @IsNotEmpty()
  @IsString()
  url: string;
}
