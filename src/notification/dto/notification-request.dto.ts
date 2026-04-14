import { Expose } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class CreateNotificationRequestDto {
  @IsUUID(undefined, {
    message: i18nValidationMessage('validation.errors.isUUID'),
  })
  @Expose({ name: 'user_id' })
  userId: string;

  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.isNotEmpty'),
  })
  title: string;

  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  content?: string;

  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsIn(['unread', 'read'])
  status?: 'unread' | 'read';

  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.isNotEmpty'),
  })
  @Expose({ name: 'action_type' })
  actionType: string;

  @IsOptional()
  @IsObject({ message: i18nValidationMessage('validation.errors.isObject') })
  target?: Record<string, any>;

  @IsOptional()
  @IsArray({ message: i18nValidationMessage('validation.errors.isArray') })
  tags?: string[];

  @IsOptional()
  @IsObject({ message: i18nValidationMessage('validation.errors.isObject') })
  attrs?: Record<string, any>;
}

export class ListNotificationsDto {
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsIn(['all', 'unread', 'read'])
  @Expose({ name: 'status' })
  status?: 'all' | 'unread' | 'read';

  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @Expose({ name: 'tags' })
  tags?: string;

  @IsOptional()
  @IsInt({ message: i18nValidationMessage('validation.errors.isInt') })
  @Min(1, { message: i18nValidationMessage('validation.errors.min') })
  @Expose({ name: 'offset' })
  offset?: number;

  @IsOptional()
  @IsInt({ message: i18nValidationMessage('validation.errors.isInt') })
  @Min(1, { message: i18nValidationMessage('validation.errors.min') })
  @Expose({ name: 'limit' })
  limit?: number;
}

export class UpdateNotificationDto {
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsIn(['read'], {
    message: i18nValidationMessage('validation.errors.isIn'),
  })
  status: 'read';
}

export class ClearNotificationsDto {
  @IsOptional()
  @IsIn(['all', 'unread', 'read'], {
    message: i18nValidationMessage('validation.errors.isIn'),
  })
  status?: 'all' | 'unread' | 'read';

  @IsOptional()
  @IsArray({ message: i18nValidationMessage('validation.errors.isArray') })
  @IsUUID(undefined, {
    each: true,
    message: i18nValidationMessage('validation.errors.isUUID'),
  })
  ids?: string[];
}
