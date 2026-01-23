import { IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CollectUrlRequestDto {
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

  @ApiPropertyOptional({
    description: 'Parent resource ID to place the collected content under',
  })
  @IsString({
    message: i18nValidationMessage('validation.errors.parentId.isString'),
  })
  @IsOptional()
  parentId?: string;
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
