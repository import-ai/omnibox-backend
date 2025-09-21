import {
  IsString,
  IsArray,
  IsOptional,
  IsBoolean,
  IsUrl,
} from 'class-validator';

export class CreateClientDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @IsString({ each: true })
  @IsUrl({}, { each: true })
  redirect_uris: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  grants?: string[];

  @IsOptional()
  @IsBoolean()
  is_confidential?: boolean;

  @IsOptional()
  @IsString()
  logo_url?: string;

  @IsOptional()
  @IsString()
  website_url?: string;

  @IsOptional()
  @IsString()
  privacy_policy_url?: string;

  @IsOptional()
  @IsString()
  terms_of_service_url?: string;
}

export class ClientResponseDto {
  client_id: string;
  client_secret?: string;
  name: string;
  description?: string;
  redirect_uris: string[];
  scopes: string[];
  grants: string[];
  is_confidential: boolean;
  logo_url?: string;
  website_url?: string;
  privacy_policy_url?: string;
  terms_of_service_url?: string;
  created_at: Date;
}
