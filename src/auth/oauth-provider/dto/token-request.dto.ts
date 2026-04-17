import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsIn } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class TokenRequestDto {
  @ApiProperty({
    description: 'OAuth grant type',
    example: 'authorization_code',
  })
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.isNotEmpty'),
  })
  @IsIn(['authorization_code'], {
    message: i18nValidationMessage('validation.errors.isIn'),
  })
  grant_type: string;

  @ApiProperty({
    description: 'Authorization code received from authorize endpoint',
    example: 'abc123def456',
  })
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.isNotEmpty'),
  })
  code: string;

  @ApiProperty({
    description: 'Redirect URI that was used in authorize request',
    example: 'https://forum.example.com/auth/callback',
  })
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.isNotEmpty'),
  })
  redirect_uri: string;

  @ApiProperty({
    description: 'OAuth client identifier',
    example: 'flarum-forum',
  })
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.isNotEmpty'),
  })
  client_id: string;

  @ApiPropertyOptional({
    description: 'OAuth client secret',
    example: 'secret123',
  })
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsOptional()
  client_secret?: string;

  @ApiPropertyOptional({
    description: 'PKCE code verifier',
    example: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
  })
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsOptional()
  code_verifier?: string;
}

export class TokenResponseDto {
  @ApiProperty({
    description: 'Access token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  access_token: string;

  @ApiProperty({
    description: 'Token type',
    example: 'Bearer',
  })
  token_type: string;

  @ApiProperty({
    description: 'Token expiry in seconds',
    example: 3600,
  })
  expires_in: number;

  @ApiProperty({
    description: 'Granted scopes',
    example: 'openid profile email',
  })
  scope: string;
}
