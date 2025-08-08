import { Expose } from 'class-transformer';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { ResourcePermission } from '../resource-permission.enum';

@Expose()
export class PermissionDto {
  @IsEnum(ResourcePermission)
  @IsNotEmpty()
  permission: ResourcePermission;
}
