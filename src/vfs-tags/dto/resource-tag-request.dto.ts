import { IsString } from 'class-validator';
import { Expose } from 'class-transformer';

export class ResourceTagRequestDto {
  @IsString()
  @Expose({ name: 'md_path' })
  mdPath: string;

  @IsString()
  @Expose({ name: 'tag_name' })
  tagName: string;
}
