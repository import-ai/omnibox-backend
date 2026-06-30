import { Expose } from 'class-transformer';
import { IsString } from 'class-validator';

export class ResourceTagRequestDto {
  @IsString()
  @Expose({ name: 'resource_id' })
  resourceId: string;

  @IsString()
  @Expose({ name: 'tag_name' })
  tagName: string;
}
