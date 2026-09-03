import { Expose, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsHash,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class ResourceCommentAnchorRequestDto {
  @IsUUID(undefined, {
    message: i18nValidationMessage('validation.errors.isUUID'),
  })
  @Expose({ name: 'thread_id' })
  threadId: string;

  @IsInt({ message: i18nValidationMessage('validation.errors.isInt') })
  @Min(0, { message: i18nValidationMessage('validation.errors.min') })
  from: number;

  @IsInt({ message: i18nValidationMessage('validation.errors.isInt') })
  @Min(1, { message: i18nValidationMessage('validation.errors.min') })
  to: number;

  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @MaxLength(5000)
  @Expose({ name: 'quoted_text' })
  quotedText: string;

  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @MaxLength(500)
  prefix?: string;

  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @MaxLength(500)
  suffix?: string;
}

export class CreateResourceCommentThreadRequestDto {
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.isNotEmpty'),
  })
  @MaxLength(5000)
  @Expose({ name: 'quoted_text' })
  quotedText: string;

  @IsInt({ message: i18nValidationMessage('validation.errors.isInt') })
  @Min(0, { message: i18nValidationMessage('validation.errors.min') })
  @Expose({ name: 'anchor_from' })
  anchorFrom: number;

  @IsInt({ message: i18nValidationMessage('validation.errors.isInt') })
  @Min(1, { message: i18nValidationMessage('validation.errors.min') })
  @Expose({ name: 'anchor_to' })
  anchorTo: number;

  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @MaxLength(500)
  @Expose({ name: 'anchor_prefix' })
  anchorPrefix?: string;

  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @MaxLength(500)
  @Expose({ name: 'anchor_suffix' })
  anchorSuffix?: string;

  @IsHash('sha256')
  @Expose({ name: 'expected_content_hash' })
  expectedContentHash: string;

  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.isNotEmpty'),
  })
  @MaxLength(10000)
  content: string;
}

export class CreateResourceCommentRequestDto {
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.isNotEmpty'),
  })
  @MaxLength(10000)
  content: string;
}

export class UpdateResourceCommentRequestDto extends CreateResourceCommentRequestDto {}

export class ListResourceCommentThreadsRequestDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: i18nValidationMessage('validation.errors.isInt') })
  @Min(0, { message: i18nValidationMessage('validation.errors.min') })
  offlet: number = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: i18nValidationMessage('validation.errors.isInt') })
  @Min(1, { message: i18nValidationMessage('validation.errors.min') })
  @Max(100, { message: i18nValidationMessage('validation.errors.max') })
  limits: number = 20;

  @IsOptional()
  @IsIn(['true', 'false'], {
    message: i18nValidationMessage('validation.errors.isIn'),
  })
  resolved?: 'true' | 'false';
}

export class UpdateResourceCommentThreadRequestDto {
  @IsBoolean({
    message: i18nValidationMessage('validation.errors.isBoolean'),
  })
  resolved: boolean;
}

export class SyncResourceCommentAnchorsRequestDto {
  @IsHash('sha256')
  @Expose({ name: 'expected_content_hash' })
  expectedContentHash: string;

  @IsArray({ message: i18nValidationMessage('validation.errors.isArray') })
  @ValidateNested({ each: true })
  @Type(() => ResourceCommentAnchorRequestDto)
  @Expose({ name: 'comment_anchors' })
  commentAnchors: ResourceCommentAnchorRequestDto[];
}
