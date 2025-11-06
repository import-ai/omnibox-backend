import { IsOptional, IsString, IsUUID, IsObject } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { Applications } from 'omniboxd/applications/applications.entity';

export class FindAllApplicationsDto {
  @IsUUID(undefined, {
    message: i18nValidationMessage('validation.errors.isUUID'),
  })
  @IsOptional()
  api_key_id?: string;
}

export class CreateApplicationsDto {
  @IsUUID(undefined, {
    message: i18nValidationMessage('validation.errors.isUUID'),
  })
  @IsOptional()
  api_key_id?: string;

  @IsObject({ message: i18nValidationMessage('validation.errors.isObject') })
  @IsOptional()
  attrs?: Record<string, any>;
}

export class ApplicationsResponseDto {
  @IsUUID(undefined, {
    message: i18nValidationMessage('validation.errors.isUUID'),
  })
  id: string;

  @IsString({
    message: i18nValidationMessage('validation.errors.namespaceId.isString'),
  })
  namespace_id: string;

  @IsString({
    message: i18nValidationMessage('validation.errors.userId.isString'),
  })
  user_id: string;

  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  app_id: string;

  @IsUUID(undefined, {
    message: i18nValidationMessage('validation.errors.isUUID'),
  })
  @IsOptional()
  api_key_id: string | null;

  @IsObject({ message: i18nValidationMessage('validation.errors.isObject') })
  attrs: Record<string, any>;

  created_at: Date;

  updated_at: Date;

  static fromEntity(entity: Applications): ApplicationsResponseDto {
    const dto = new ApplicationsResponseDto();
    dto.id = entity.id;
    dto.namespace_id = entity.namespaceId;
    dto.user_id = entity.userId;
    dto.app_id = entity.appId;
    dto.api_key_id = entity.apiKeyId;
    dto.attrs = entity.attrs;
    dto.created_at = entity.createdAt;
    dto.updated_at = entity.updatedAt;
    return dto;
  }
}
