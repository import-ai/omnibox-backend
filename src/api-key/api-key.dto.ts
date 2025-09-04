import { IsOptional, IsString, IsUUID, IsObject } from 'class-validator';
import { APIKeyAttrs, APIKey } from './api-key.entity';

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
