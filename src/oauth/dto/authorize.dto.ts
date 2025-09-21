import { IsString, IsOptional, IsIn, IsUrl } from 'class-validator';

export class AuthorizeDto {
  @IsString()
  response_type: string;

  @IsString()
  client_id: string;

  @IsString()
  @IsUrl()
  redirect_uri: string;

  @IsOptional()
  @IsString()
  scope?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  code_challenge?: string;

  @IsOptional()
  @IsString()
  @IsIn(['S256', 'plain'])
  code_challenge_method?: string;
}

export class AuthorizeApprovalDto {
  @IsString()
  client_id: string;

  @IsString()
  @IsUrl()
  redirect_uri: string;

  @IsOptional()
  @IsString()
  scope?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  code_challenge?: string;

  @IsOptional()
  @IsString()
  code_challenge_method?: string;

  @IsString()
  @IsIn(['allow', 'deny'])
  decision: string;
}
