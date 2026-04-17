import { Expose, Transform } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { NamespaceRole } from 'omniboxd/namespaces/entities/namespace-member.entity';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { IsAllowedEmailDomain } from '../../utils/email-validation';

export class InviteDto {
  @Expose()
  @IsString()
  inviteUrl: string;

  @Expose()
  @IsString()
  registerUrl: string;

  @Expose()
  @IsString()
  namespace: string;

  @Expose()
  @IsEnum(NamespaceRole)
  role: NamespaceRole;

  @Expose()
  @IsString()
  @IsOptional()
  resourceId?: string;

  @Expose()
  @IsEnum(ResourcePermission)
  @IsOptional()
  permission?: ResourcePermission;

  @Expose()
  @IsString()
  @IsOptional()
  groupId?: string;

  @Expose()
  @Transform(({ value }) =>
    Array.isArray(value) ? value.map((e: string) => e?.toLowerCase?.()) : value,
  )
  @IsArray()
  @IsOptional()
  @IsEmail(
    {},
    {
      each: true,
      message: i18nValidationMessage('validation.errors.email.isEmail'),
    },
  )
  @IsAllowedEmailDomain({
    each: true,
    message: i18nValidationMessage('validation.errors.email.domainNotAllowed'),
  })
  emails?: string[];

  @Expose()
  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  groupTitles?: string[];

  @Expose()
  @IsString()
  @IsOptional()
  inviteType?: 'normal' | 'share';
}
