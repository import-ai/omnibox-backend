import { Expose } from 'class-transformer';
import { IsString, IsArray } from 'class-validator';

export class AddGroupUserDto {
  @IsArray()
  @IsString({ each: true })
  @Expose({ name: 'user_id' })
  userIds: string[];
}
