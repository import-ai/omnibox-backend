import { IsString, IsArray } from 'class-validator';

export class AddGroupUserDto {
  @IsArray()
  @IsString({ each: true })
  userIds: string[];
}
