import { ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
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
  @Expose({ name: 'parent_id' })
  @IsString({
    message: i18nValidationMessage('validation.errors.parentId.isString'),
  })
  @IsOptional()
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.parentId.isNotEmpty'),
  })
  parentId?: string;

  @ApiPropertyOptional({
    description:
      'Array of non-empty tag names to associate with the resource. Replaces existing tags; send an empty array to clear tags. Missing tags are created automatically.',
    type: [String],
    example: ['project', 'meeting-notes'],
    maxLength: 20,
  })
  @Expose({ name: 'tag_names' })
  @IsArray({ message: i18nValidationMessage('validation.errors.isArray') })
  @IsOptional()
  @IsString({
    each: true,
    message: i18nValidationMessage('validation.errors.isString'),
  })
  @IsNotEmpty({
    each: true,
    message: i18nValidationMessage('validation.errors.isNotEmpty'),
  })
  @MaxLength(20, {
    each: true,
    message: i18nValidationMessage('validation.errors.name.maxLength'),
  })
  tagNames?: string[];

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
