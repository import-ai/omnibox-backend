import { Expose } from 'class-transformer';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { ResourcePermission } from '../permission-level.enum';

@Expose()
export class PermissionDto {
  @IsEnum(ResourcePermission)
  @IsNotEmpty()
  level: ResourcePermission;
}
