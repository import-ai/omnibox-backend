import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { APIKey, APIKeyAttrs, APIKeyPermission } from './api-key.entity';
import { NamespaceResponseDto } from 'omniboxd/namespaces/dto/namespace-response.dto';
import { UserResponseDto } from 'omniboxd/user/dto/user-response.dto';

export class CreateAPIKeyDto {
  @IsString()
  user_id: string;

  @IsString()
  namespace_id: string;

  @IsObject()
  @IsOptional()
  attrs?: APIKeyAttrs;
}

export class UpdateAPIKeyDto {
  @IsObject()
  @IsOptional()
  attrs?: APIKeyAttrs;
}

export class PatchAPIKeyDto {
  @IsString()
  @IsOptional()
  root_resource_id?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => Object)
  @IsOptional()
  permissions?: APIKeyPermission[];
}

export class APIKeyResponseDto {
  @IsUUID()
  id: string;

  @IsString()
  value: string;

  @IsString()
  user_id: string;

  @IsString()
  namespace_id: string;

  @IsObject()
  attrs: APIKeyAttrs;

  created_at: Date;

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

export interface APIKeyInfoDto {
  api_key: APIKeyResponseDto;
  namespace: NamespaceResponseDto;
  user: UserResponseDto;
}
