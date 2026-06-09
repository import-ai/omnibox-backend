import { Expose } from 'class-transformer';
import { IsString } from 'class-validator';

export class ResourceTagRequestDto {
  @IsString()
  @Expose({ name: 'md_path' })
  mdPath: string;

  @IsString()
  @Expose({ name: 'tag_name' })
  tagName: string;
}
