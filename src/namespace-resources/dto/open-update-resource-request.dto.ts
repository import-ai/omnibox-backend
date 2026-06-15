import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class OpenUpdateResourceRequestDto {
  @ApiPropertyOptional({
    description: 'Resource name/title',
    example: 'My Updated Document Title',
  })
  @IsString({
    message: i18nValidationMessage('validation.errors.name.isString'),
  })
  @MaxLength(128, {
    message: i18nValidationMessage('validation.errors.name.maxLength'),
  })
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    description:
      'Parent resource ID under the API key root. Use this to move a resource.',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsString({
    message: i18nValidationMessage('validation.errors.parentId.isString'),
  })
  @IsOptional()
  parent_id?: string;

  @ApiPropertyOptional({
    description:
      'Array of tag names to associate with the resource. Replaces existing tags.',
    type: [String],
    example: ['project', 'meeting-notes'],
  })
  @IsArray({ message: i18nValidationMessage('validation.errors.isArray') })
  @IsOptional()
  @IsString({
    each: true,
    message: i18nValidationMessage('validation.errors.isString'),
  })
  tag_names?: string[];

  @ApiPropertyOptional({
    description: 'Content of the resource/document',
    example: 'This is the updated content of my document.',
  })
  @IsString({
    message: i18nValidationMessage('validation.errors.content.isString'),
  })
  @IsOptional()
  content?: string;

  @ApiPropertyOptional({
    description: 'Additional attributes/metadata for the resource',
    type: 'object',
    additionalProperties: true,
    example: { source: 'api', custom_field: 'value' },
  })
  @IsObject({ message: i18nValidationMessage('validation.errors.isObject') })
  @IsOptional()
  attrs?: Record<string, any>;
}
