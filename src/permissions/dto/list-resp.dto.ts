import { Expose } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';
import { PermissionLevel } from '../permission-level.enum';

@Expose()
export class GroupDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  title: string;
}

@Expose()
export class UserDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  email: string;
}

@Expose()
export class UserPermissionDto {
  type: 'user';

  @IsNotEmpty()
  user: UserDto;

  @IsEnum(PermissionLevel)
  @IsNotEmpty()
  level: PermissionLevel;
}

@Expose()
export class GroupPermissionDto {
  type: 'group';

  @IsNotEmpty()
  group: GroupDto;

  @IsEnum(PermissionLevel)
  @IsNotEmpty()
  level: PermissionLevel;
}

export type PermissionEntryDto = UserPermissionDto | GroupPermissionDto;

@Expose()
export class ListRespDto {
  @IsEnum(PermissionLevel)
  @IsNotEmpty()
  globalLevel: PermissionLevel;

  @IsArray()
  @ValidateNested({ each: true })
  entries: PermissionEntryDto[];
}
