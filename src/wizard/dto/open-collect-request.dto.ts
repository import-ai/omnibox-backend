import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { ApiProperty } from '@nestjs/swagger';

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

  @ApiProperty({
    description: 'Parent resource ID (optional, defaults to root resource)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsString({
    message: i18nValidationMessage('validation.errors.parentId.isString'),
  })
  @IsOptional()
  parentId?: string;

  @ApiProperty({
    description: 'Compressed HTML file of the web page',
    type: 'string',
    format: 'binary',
  })
  html: any;
}
