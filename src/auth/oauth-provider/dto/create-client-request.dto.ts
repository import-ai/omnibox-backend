import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsArray,
  IsOptional,
  ArrayMinSize,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class CreateClientRequestDto {
  @ApiProperty({
    description: 'Unique client identifier',
    example: 'flarum-forum',
  })
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.isNotEmpty'),
  })
  clientId: string;

  @ApiProperty({
    description: 'Display name for the OAuth application',
    example: 'OmniBox Forum',
  })
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.isNotEmpty'),
  })
  name: string;

  @ApiProperty({
    description: 'Allowed redirect URIs',
    example: ['https://forum.example.com/auth/callback'],
  })
  @IsArray({ message: i18nValidationMessage('validation.errors.isArray') })
  @ArrayMinSize(1, {
    message: i18nValidationMessage('validation.errors.arrayMinSize'),
  })
  @IsString({
    each: true,
    message: i18nValidationMessage('validation.errors.isString'),
  })
  redirectUris: string[];

  @ApiPropertyOptional({
    description: 'Allowed OAuth scopes',
    example: ['openid', 'profile', 'email'],
    default: ['openid', 'profile', 'email'],
  })
  @IsArray({ message: i18nValidationMessage('validation.errors.isArray') })
  @IsString({
    each: true,
    message: i18nValidationMessage('validation.errors.isString'),
  })
  @IsOptional()
  scopes?: string[];
}

export class CreateClientResponseDto {
  @ApiProperty({
    description: 'Generated client ID',
    example: 'flarum-forum',
  })
  clientId: string;

  @ApiProperty({
    description: 'Generated client secret (only shown once)',
    example: 'cs_abc123def456...',
  })
  clientSecret: string;

  @ApiProperty({
    description: 'Display name',
    example: 'OmniBox Forum',
  })
  name: string;

  @ApiProperty({
    description: 'Allowed redirect URIs',
    example: ['https://forum.example.com/auth/callback'],
  })
  redirectUris: string[];

  @ApiProperty({
    description: 'Allowed scopes',
    example: ['openid', 'profile', 'email'],
  })
  scopes: string[];
}
