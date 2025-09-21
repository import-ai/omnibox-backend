import { IsString, IsOptional, IsIn } from 'class-validator';

export class TokenDto {
  @IsString()
  @IsIn(['authorization_code', 'refresh_token'])
  grant_type: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  redirect_uri?: string;

  @IsOptional()
  @IsString()
  client_id?: string;

  @IsOptional()
  @IsString()
  client_secret?: string;

  @IsOptional()
  @IsString()
  refresh_token?: string;

  @IsOptional()
  @IsString()
  code_verifier?: string;

  @IsOptional()
  @IsString()
  scope?: string;
}

export class TokenResponseDto {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

export class TokenErrorDto {
  error: string;
  error_description?: string;
  error_uri?: string;
}