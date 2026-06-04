import {
  IsArray,
  IsString,
  IsObject,
  IsOptional,
  IsBoolean,
  IsIn,
  MaxLength,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { ApiProperty } from '@nestjs/swagger';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';

export class OpenCreateResourceDto {
  @ApiProperty({
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

  @ApiProperty({
    description:
      'Resource type. Defaults to doc. Folder resources do not require content but must include name.',
    enum: [ResourceType.DOC, ResourceType.FOLDER],
    example: ResourceType.DOC,
    required: false,
  })
  @IsIn([ResourceType.DOC, ResourceType.FOLDER], {
    message: i18nValidationMessage('validation.errors.resourceType.isEnum'),
  })
  @IsOptional()
  resource_type?: ResourceType.DOC | ResourceType.FOLDER;

  @ApiProperty({
    description:
      'Parent resource ID under the API key root. Defaults to the API key root resource.',
    example: '550e8400-e29b-41d4-a716-446655440000',
    required: false,
  })
  @IsString({
    message: i18nValidationMessage('validation.errors.parentId.isString'),
  })
  @IsOptional()
  parent_id?: string;

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
