import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsIn } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class AuthorizeRequestDto {
  @ApiProperty({
    description: 'OAuth response type',
    example: 'code',
  })
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.isNotEmpty'),
  })
  @IsIn(['code'], { message: i18nValidationMessage('validation.errors.isIn') })
  response_type: string;

  @ApiProperty({
    description: 'OAuth client identifier',
    example: 'flarum-forum',
  })
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.isNotEmpty'),
  })
  client_id: string;

  @ApiProperty({
    description: 'URL to redirect after authorization',
    example: 'https://forum.example.com/auth/callback',
  })
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.isNotEmpty'),
  })
  redirect_uri: string;

  @ApiPropertyOptional({
    description: 'Requested OAuth scopes (space-separated)',
    example: 'openid profile email',
  })
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsOptional()
  scope?: string;

  @ApiPropertyOptional({
    description: 'CSRF state parameter',
    example: 'xyz123',
  })
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsOptional()
  state?: string;

  @ApiPropertyOptional({
    description: 'PKCE code challenge',
    example: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
  })
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsOptional()
  code_challenge?: string;

  @ApiPropertyOptional({
    description: 'PKCE code challenge method',
    example: 'S256',
  })
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsOptional()
  @IsIn(['S256', 'plain'], {
    message: i18nValidationMessage('validation.errors.isIn'),
  })
  code_challenge_method?: string;
}
