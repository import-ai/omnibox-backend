import { IsOptional, IsString, IsUUID, IsObject } from 'class-validator';

export class CreateAPIKeyDto {
  @IsString()
  user_id: string;

  @IsString()
  namespace_id: string;

  @IsObject()
  @IsOptional()
  attrs?: Record<string, any>;
}

export class UpdateAPIKeyDto {
  @IsString()
  @IsOptional()
  user_id?: string;

  @IsString()
  @IsOptional()
  namespace_id?: string;

  @IsObject()
  @IsOptional()
  attrs?: Record<string, any>;
}

export class APIKeyResponseDto {
  @IsUUID()
  id: string;

  @IsString()
  user_id: string;

  @IsString()
  namespace_id: string;

  @IsObject()
  attrs: Record<string, any>;

  created_at: Date;

  updated_at: Date;
}
