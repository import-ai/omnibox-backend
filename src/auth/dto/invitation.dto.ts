import { Expose } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { NamespaceRole } from 'omniboxd/namespaces/entities/namespace-member.entity';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';

// Invite a user to a group or a resource within a namespace
export class UserInvitationDto {
  @Expose()
  @IsString({
    message: i18nValidationMessage('validation.errors.namespaceId.isString'),
  })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.namespaceId.isNotEmpty'),
  })
  namespaceId: string;

  @Expose()
  @IsEnum(NamespaceRole, {
    message: i18nValidationMessage('validation.errors.isEnum'),
  })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.isNotEmpty'),
  })
  namespaceRole: NamespaceRole;

  @Expose()
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsOptional()
  resourceId?: string;

  @Expose()
  @IsEnum(ResourcePermission, {
    message: i18nValidationMessage('validation.errors.permission.isEnum'),
  })
  @IsOptional()
  permission?: ResourcePermission;

  @Expose()
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsOptional()
  groupId?: string | null;
}
