import { Exclude, Expose, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';
import { PermissionLevel } from '../permission-level.enum';

@Exclude()
export class GroupDto {
  @Expose()
  @IsString()
  @IsNotEmpty()
  id: string;

  @Expose()
  @IsString()
  title: string;
}

@Exclude()
export class UserDto {
  @Expose()
  @IsString()
  @IsNotEmpty()
  id: string;

  @Expose()
  @IsString()
  @IsNotEmpty()
  email: string;
}

@Exclude()
export class UserPermissionDto {
  @Expose()
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => UserDto)
  user: UserDto;

  @Expose()
  @IsEnum(PermissionLevel)
  @IsNotEmpty()
  level: PermissionLevel;
}

@Exclude()
export class GroupPermissionDto {
  @Expose()
  @IsNotEmpty()
  @Type(() => GroupDto)
  group: GroupDto;

  @Expose()
  @IsEnum(PermissionLevel)
  @IsNotEmpty()
  level: PermissionLevel;
}

@Exclude()
export class ListRespDto {
  @Expose()
  @IsEnum(PermissionLevel)
  @IsNotEmpty()
  globalLevel: PermissionLevel;

  @Expose()
  @IsEnum(PermissionLevel)
  @IsNotEmpty()
  currentUserLevel: PermissionLevel;

  @Expose()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UserPermissionDto)
  users: UserPermissionDto[];

  @Expose()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GroupPermissionDto)
  groups: GroupPermissionDto[];
}
