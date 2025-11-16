import {
  IsArray,
  IsString,
  IsObject,
  IsOptional,
  IsNotEmpty,
  IsBoolean,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { ApiProperty } from '@nestjs/swagger';

export class OpenCreateResourceDto {
  @ApiProperty({
    description: 'Resource name/title',
    example: 'My Document Title',
  })
  @IsString({
    message: i18nValidationMessage('validation.errors.name.isString'),
  })
  @IsOptional()
  name?: string;

  @ApiProperty({
    description: 'Array of tag IDs to associate with the resource',
    type: [String],
    example: ['550e8400-e29b-41d4-a716-446655440000'],
  })
  @IsArray({ message: i18nValidationMessage('validation.errors.isArray') })
  @IsOptional()
  @IsString({
    each: true,
    message: i18nValidationMessage('validation.errors.isString'),
  })
  tag_ids?: string[];

  @ApiProperty({
    description: 'Content of the resource/document',
    example: 'This is the content of my document. #tag1 #tag2',
  })
  @IsString({
    message: i18nValidationMessage('validation.errors.content.isString'),
  })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.content.isNotEmpty'),
  })
  content: string;

  @ApiProperty({
    description: 'Additional attributes/metadata for the resource',
    type: 'object',
    additionalProperties: true,
    example: { source: 'api', custom_field: 'value' },
  })
  @IsObject({ message: i18nValidationMessage('validation.errors.isObject') })
  @IsOptional()
  attrs?: Record<string, any>;

  @ApiProperty({
    description: 'Skip automatic parsing of hashtags from content',
    example: false,
  })
  @IsBoolean({ message: i18nValidationMessage('validation.errors.isBoolean') })
  @IsOptional()
  skip_parsing_tags_from_content?: boolean;
}
