import { IsOptional, IsString, IsUUID, IsObject } from 'class-validator';
import { APIKeyAttrs } from './api-key.entity';

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
}
