import { Expose } from 'class-transformer';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { ResourcePermission } from '../resource-permission.enum';

@Expose()
export class PermissionDto {
  @IsEnum(ResourcePermission, {
    message: i18nValidationMessage('validation.errors.permission.isEnum'),
  })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.permission.isNotEmpty'),
  })
  permission: ResourcePermission;
}
