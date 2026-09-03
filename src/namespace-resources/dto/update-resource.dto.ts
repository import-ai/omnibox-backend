import { Expose, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsHash,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { ResourceCommentAnchorRequestDto } from 'omniboxd/resource-comments/dto/resource-comment-request.dto';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';

export class UpdateResourceDto {
  @IsString({
    message: i18nValidationMessage('validation.errors.name.isString'),
  })
  @MaxLength(128, {
    message: i18nValidationMessage('validation.errors.name.maxLength'),
  })
  @IsOptional()
  name?: string;

  @IsString({
    message: i18nValidationMessage('validation.errors.namespaceId.isString'),
  })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.namespaceId.isNotEmpty'),
  })
  @IsOptional()
  namespaceId?: string;

  @IsEnum(ResourceType, {
    message: i18nValidationMessage('validation.errors.resourceType.isEnum'),
  })
  @IsOptional()
  resourceType?: ResourceType;

  @IsString({
    message: i18nValidationMessage('validation.errors.parentId.isString'),
  })
  @IsOptional()
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.parentId.isNotEmpty'),
  })
  parentId?: string;

  @IsArray({ message: i18nValidationMessage('validation.errors.isArray') })
  @IsOptional()
  @IsString({
    each: true,
    message: i18nValidationMessage('validation.errors.isString'),
  })
  tag_ids?: string[];

  @IsString({
    message: i18nValidationMessage('validation.errors.content.isString'),
  })
  @IsOptional()
  content?: string;

  @IsObject({ message: i18nValidationMessage('validation.errors.isObject') })
  @IsOptional()
  attrs?: Record<string, any>;

  @IsHash('sha256')
  @IsOptional()
  @Expose({ name: 'expected_content_hash' })
  expectedContentHash?: string;

  @IsArray({ message: i18nValidationMessage('validation.errors.isArray') })
  @ValidateNested({ each: true })
  @Type(() => ResourceCommentAnchorRequestDto)
  @IsOptional()
  @Expose({ name: 'comment_anchors' })
  commentAnchors?: ResourceCommentAnchorRequestDto[];

  @IsArray({ message: i18nValidationMessage('validation.errors.isArray') })
  @IsUUID(undefined, {
    each: true,
    message: i18nValidationMessage('validation.errors.isUUID'),
  })
  @IsOptional()
  @Expose({ name: 'orphaned_comment_thread_ids' })
  orphanedCommentThreadIds?: string[];
}
