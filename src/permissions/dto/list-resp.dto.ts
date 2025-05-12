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
  @IsNotEmpty()
  user: UserDto;

  @IsEnum(PermissionLevel)
  @IsNotEmpty()
  level: PermissionLevel;
}

@Expose()
export class GroupPermissionDto {
  @IsNotEmpty()
  group: GroupDto;

  @IsEnum(PermissionLevel)
  @IsNotEmpty()
  level: PermissionLevel;
}

@Expose()
export class ListRespDto {
  @IsEnum(PermissionLevel)
  @IsNotEmpty()
  globalLevel: PermissionLevel;

  @IsArray()
  @ValidateNested({ each: true })
  users: UserPermissionDto[];

  @IsArray()
  @ValidateNested({ each: true })
  groups: GroupPermissionDto[];
}
