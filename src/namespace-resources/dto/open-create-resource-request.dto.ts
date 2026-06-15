import { ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';

export class OpenCreateResourceRequestDto {
  @ApiPropertyOptional({
    description: 'Resource name/title',
    example: 'My Document Title',
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
      'Resource type. Defaults to doc. Folder resources do not require content but must include name.',
    enum: [ResourceType.DOC, ResourceType.FOLDER],
    example: ResourceType.DOC,
    required: false,
  })
  @Expose({ name: 'resource_type' })
  @IsIn([ResourceType.DOC, ResourceType.FOLDER], {
    message: i18nValidationMessage('validation.errors.resourceType.isEnum'),
  })
  @IsOptional()
  resourceType?: ResourceType.DOC | ResourceType.FOLDER;

  @ApiPropertyOptional({
    description:
      'Parent resource ID under the API key root. Defaults to the API key root resource.',
    example: '550e8400-e29b-41d4-a716-446655440000',
    required: false,
  })
  @Expose({ name: 'parent_id' })
  @IsString({
    message: i18nValidationMessage('validation.errors.parentId.isString'),
  })
  @IsOptional()
  parentId?: string;

  @ApiPropertyOptional({
    description:
      'Array of non-empty tag names to associate with the resource. Missing tags are created automatically.',
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
    description:
      'Content of the resource/document. Required for doc resources and optional for folder resources.',
    example: 'This is the content of my document. #tag1 #tag2',
    required: false,
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

  @ApiPropertyOptional({
    description: 'Skip automatic parsing of hashtags from content',
    example: false,
  })
  @Expose({ name: 'skip_parsing_tags_from_content' })
  @IsBoolean({ message: i18nValidationMessage('validation.errors.isBoolean') })
  @IsOptional()
  skipParsingTagsFromContent?: boolean;
}
