import { IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { ApiProperty } from '@nestjs/swagger';

export class BaseCollectUrlRequestDto {
  @ApiProperty({
    description: 'The URL to collect content from',
    example: 'https://example.com/article',
  })
  @IsUrl(
    {},
    {
      message: i18nValidationMessage('validation.errors.url.isUrl'),
    },
  )
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.url.isNotEmpty'),
  })
  url: string;
}

export class OpenCollectUrlRequestDto extends BaseCollectUrlRequestDto {
  @ApiProperty({
    description: 'Parent resource ID (optional, defaults to root resource)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsString({
    message: i18nValidationMessage('validation.errors.parentId.isString'),
  })
  @IsOptional()
  parentId?: string;
}

export class CollectUrlRequestDto extends BaseCollectUrlRequestDto {
  @ApiProperty({
    description: 'Parent resource ID to place the collected content under',
  })
  @IsString({
    message: i18nValidationMessage('validation.errors.parentId.isString'),
  })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.parentId.isNotEmpty'),
  })
  parentId: string;
}

export class CollectUrlResponseDto {
  @ApiProperty({
    description: 'The ID of the created resource',
  })
  @IsString({
    message: i18nValidationMessage('validation.errors.resource_id.isString'),
  })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.resource_id.isNotEmpty'),
  })
  resource_id: string;
}
