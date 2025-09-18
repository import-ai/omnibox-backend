import { IsOptional, IsString, IsUUID, IsObject } from 'class-validator';
import { Applications } from 'omniboxd/applications/applications.entity';

export class FindAllApplicationsDto {
  @IsUUID()
  @IsOptional()
  api_key_id?: string;
}

export class CreateApplicationsDto {
  @IsUUID()
  @IsOptional()
  api_key_id?: string;

  @IsObject()
  @IsOptional()
  attrs?: Record<string, any>;
}

export class ApplicationsResponseDto {
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
