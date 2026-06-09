import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class OpenCollectRequestDto {
  @ApiProperty({
    description: 'URL of the web page to collect',
    example: 'https://example.com/article',
  })
  @IsString({
    message: i18nValidationMessage('validation.errors.url.isString'),
  })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.url.isNotEmpty'),
  })
  url: string;

  @ApiProperty({
    description: 'Title of the web page',
    example: 'My Article Title',
  })
  @IsString({
    message: i18nValidationMessage('validation.errors.title.isString'),
  })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.title.isNotEmpty'),
  })
  title: string;

  @ApiPropertyOptional({
    description: 'Parent resource ID. Defaults to the API key root resource',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsString({
    message: i18nValidationMessage('validation.errors.parentId.isString'),
  })
  @IsOptional()
  parentId?: string;
}
