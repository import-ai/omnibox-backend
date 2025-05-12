import { Expose } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';
import { PermissionType } from '../permission-type.enum';

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

  @IsEnum(PermissionType)
  @IsNotEmpty()
  permission: PermissionType;
}

@Expose()
export class GroupPermissionDto {
  type: 'group';

  @IsNotEmpty()
  group: GroupDto;

  @IsEnum(PermissionType)
  @IsNotEmpty()
  permission: PermissionType;
}

export type PermissionEntryDto = UserPermissionDto | GroupPermissionDto;

@Expose()
export class ListRespDto {
  @IsEnum(PermissionType)
  @IsNotEmpty()
  globalPermission: PermissionType;

  @IsArray()
  @ValidateNested({ each: true })
  entries: PermissionEntryDto[];
}
