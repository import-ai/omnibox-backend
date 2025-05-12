import { Expose } from 'class-transformer';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { PermissionType } from '../permission-type.enum';

@Expose()
export class PermissionDto {
  @IsEnum(PermissionType)
  @IsNotEmpty()
  permissionType: PermissionType;
}
