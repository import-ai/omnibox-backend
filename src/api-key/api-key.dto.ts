import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { Type } from 'class-transformer';
import { APIKey, APIKeyAttrs, APIKeyPermission } from './api-key.entity';
import { NamespaceResponseDto } from 'omniboxd/namespaces/dto/namespace-response.dto';
import { UserResponseDto } from 'omniboxd/user/dto/user-response.dto';
import { ApiProperty } from '@nestjs/swagger';

export class CreateAPIKeyDto {
  @IsString({
    message: i18nValidationMessage('validation.errors.userId.isString'),
  })
  user_id: string;

  @IsString({
    message: i18nValidationMessage('validation.errors.namespaceId.isString'),
  })
  namespace_id: string;

  @IsObject({ message: i18nValidationMessage('validation.errors.isObject') })
  @IsOptional()
  attrs?: APIKeyAttrs;
}

export class UpdateAPIKeyDto {
  @IsObject({ message: i18nValidationMessage('validation.errors.isObject') })
  @IsOptional()
  attrs?: APIKeyAttrs;
}

export class PatchAPIKeyDto {
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsOptional()
  root_resource_id?: string;

  @IsArray({ message: i18nValidationMessage('validation.errors.isArray') })
  @ValidateNested({ each: true })
  @Type(() => Object)
  @IsOptional()
  permissions?: APIKeyPermission[];
}

export class APIKeyResponseDto {
  @ApiProperty({ description: 'API key ID' })
  @IsUUID(undefined, {
    message: i18nValidationMessage('validation.errors.isUUID'),
  })
  id: string;

  @ApiProperty({ description: 'API key value' })
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  value: string;

  @ApiProperty({ description: 'User ID associated with the API key' })
  @IsString({
    message: i18nValidationMessage('validation.errors.userId.isString'),
  })
  user_id: string;

  @ApiProperty({ description: 'Namespace ID associated with the API key' })
  @IsString({
    message: i18nValidationMessage('validation.errors.namespaceId.isString'),
  })
  namespace_id: string;

  @ApiProperty({ description: 'API key attributes and settings' })
  @IsObject({ message: i18nValidationMessage('validation.errors.isObject') })
  attrs: APIKeyAttrs;

  @ApiProperty({ description: 'Creation timestamp' })
  created_at: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updated_at: Date;

  static fromEntity(apiKey: APIKey): APIKeyResponseDto {
    const dto = new APIKeyResponseDto();
    dto.id = apiKey.id;
    dto.value = apiKey.value;
    dto.user_id = apiKey.userId;
    dto.namespace_id = apiKey.namespaceId;
    dto.attrs = apiKey.attrs;
    dto.created_at = apiKey.createdAt;
    dto.updated_at = apiKey.updatedAt;
    return dto;
  }
}

export class APIKeyInfoDto {
  @ApiProperty({
    description: 'API key details',
    type: () => APIKeyResponseDto,
  })
  api_key: APIKeyResponseDto;

  @ApiProperty({
    description: 'Associated namespace details',
    type: () => NamespaceResponseDto,
  })
  namespace: NamespaceResponseDto;

  @ApiProperty({
    description: 'Associated user details',
    type: () => UserResponseDto,
  })
  user: UserResponseDto;
}
