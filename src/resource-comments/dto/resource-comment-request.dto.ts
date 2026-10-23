import { Expose, Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
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
  Validate,
  ValidateIf,
  ValidateNested,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

import { ResourceCommentThreadType } from '../entities/resource-comment-thread.entity';

@ValidatorConstraint({ name: 'documentCommentHasNoAnchor', async: false })
class DocumentCommentHasNoAnchor implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as CreateResourceCommentThreadRequestDto;
    return (
      dto.type !== ResourceCommentThreadType.DOCUMENT ||
      [
        dto.quotedText,
        dto.anchorFrom,
        dto.anchorTo,
        dto.anchorPrefix,
        dto.anchorSuffix,
        dto.expectedContentHash,
      ].every((value) => value === undefined)
    );
  }
}

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
  @IsIn(Object.values(ResourceCommentThreadType), {
    message: i18nValidationMessage('validation.errors.isIn'),
  })
  @Validate(DocumentCommentHasNoAnchor, {
    message: i18nValidationMessage('resourceComment.errors.invalidAnchor'),
  })
  type?: ResourceCommentThreadType = ResourceCommentThreadType.INLINE;

  @ValidateIf(
    (dto: CreateResourceCommentThreadRequestDto) =>
      dto.type !== ResourceCommentThreadType.DOCUMENT,
  )
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.isNotEmpty'),
  })
  @MaxLength(5000)
  @Expose({ name: 'quoted_text' })
  quotedText?: string;

  @ValidateIf(
    (dto: CreateResourceCommentThreadRequestDto) =>
      dto.type !== ResourceCommentThreadType.DOCUMENT,
  )
  @IsInt({ message: i18nValidationMessage('validation.errors.isInt') })
  @Min(0, { message: i18nValidationMessage('validation.errors.min') })
  @Expose({ name: 'anchor_from' })
  anchorFrom?: number;

  @ValidateIf(
    (dto: CreateResourceCommentThreadRequestDto) =>
      dto.type !== ResourceCommentThreadType.DOCUMENT,
  )
  @IsInt({ message: i18nValidationMessage('validation.errors.isInt') })
  @Min(1, { message: i18nValidationMessage('validation.errors.min') })
  @Expose({ name: 'anchor_to' })
  anchorTo?: number;

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

  @ValidateIf(
    (dto: CreateResourceCommentThreadRequestDto) =>
      dto.type !== ResourceCommentThreadType.DOCUMENT,
  )
  @IsHash('sha256')
  @Expose({ name: 'expected_content_hash' })
  expectedContentHash?: string;

  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @MaxLength(10000)
  content?: string;

  @IsOptional()
  @IsArray({ message: i18nValidationMessage('validation.errors.isArray') })
  @ArrayMaxSize(9)
  @IsUUID(undefined, {
    each: true,
    message: i18nValidationMessage('validation.errors.isUUID'),
  })
  @Expose({ name: 'attachment_ids' })
  attachmentIds?: string[];
}

export class CreateResourceCommentRequestDto {
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @MaxLength(10000)
  content?: string;

  @IsOptional()
  @IsArray({ message: i18nValidationMessage('validation.errors.isArray') })
  @ArrayMaxSize(9)
  @IsUUID(undefined, {
    each: true,
    message: i18nValidationMessage('validation.errors.isUUID'),
  })
  @Expose({ name: 'attachment_ids' })
  attachmentIds?: string[];
}

export class UpdateResourceCommentRequestDto {
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.isNotEmpty'),
  })
  @MaxLength(10000)
  content?: string;

  @IsOptional()
  @IsArray({ message: i18nValidationMessage('validation.errors.isArray') })
  @ArrayMaxSize(9)
  @IsUUID(undefined, {
    each: true,
    message: i18nValidationMessage('validation.errors.isUUID'),
  })
  @Expose({ name: 'attachment_ids' })
  attachmentIds?: string[];
}

// Remove legacy query aliases after all pre-2184 web clients have been retired.
function parseCommentPageValue(value: unknown): number {
  return typeof value === 'string' || typeof value === 'number'
    ? Number(value)
    : NaN;
}

export class ListResourceCommentThreadsRequestDto {
  @IsOptional()
  @IsIn(['inline', 'sidebar', 'document'], {
    message: i18nValidationMessage('validation.errors.isIn'),
  })
  view?: 'inline' | 'sidebar' | 'document';

  @Expose()
  @Transform(({ obj }: { obj: Record<string, unknown> }) =>
    parseCommentPageValue(obj.offset ?? obj.offlet ?? 0),
  )
  @IsInt({ message: i18nValidationMessage('validation.errors.isInt') })
  @Min(0, { message: i18nValidationMessage('validation.errors.min') })
  offset: number = 0;

  @Expose()
  @Transform(({ obj }: { obj: Record<string, unknown> }) =>
    parseCommentPageValue(obj.limit ?? obj.limits ?? 20),
  )
  @IsInt({ message: i18nValidationMessage('validation.errors.isInt') })
  @Min(1, { message: i18nValidationMessage('validation.errors.min') })
  @Max(100, { message: i18nValidationMessage('validation.errors.max') })
  limit: number = 20;

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
