import { IsOptional, IsString, IsUUID, IsObject } from 'class-validator';

export class CreateAppAuthorizationDto {
  @IsString()
  user_id: string;

  @IsString()
  app_id: string;

  @IsUUID()
  @IsOptional()
  api_key_id?: string;

  @IsObject()
  @IsOptional()
  attrs?: Record<string, any>;
}

export class UpdateAppAuthorizationDto {
  @IsString()
  @IsOptional()
  app_id?: string;

  @IsUUID()
  @IsOptional()
  api_key_id?: string;

  @IsObject()
  @IsOptional()
  attrs?: Record<string, any>;
}

export class AppAuthorizationResponseDto {
  @IsUUID()
  id: string;

  @IsString()
  namespace_id: string;

  @IsString()
  user_id: string;

  @IsString()
  app_id: string;

  @IsUUID()
  @IsOptional()
  api_key_id: string | null;

  @IsObject()
  attrs: Record<string, any>;

  created_at: Date;

  updated_at: Date;
}
