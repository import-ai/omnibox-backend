import { Expose } from 'class-transformer';
import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
  Validate,
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

@ValidatorConstraint({ name: 'notificationReceiverRequired', async: false })
class NotificationReceiverRequiredConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments) {
    const dto = args.object as CreateNotificationRequestDto;
    return Boolean(dto.userId || dto.namespaceId);
  }

  defaultMessage() {
    return 'user_id or namespace_id is required';
  }
}

export class CreateNotificationRequestDto {
  @IsOptional()
  @IsUUID(undefined, {
    message: i18nValidationMessage('validation.errors.isUUID'),
  })
  @Expose({ name: 'user_id' })
  userId?: string;

  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @Expose({ name: 'namespace_id' })
  namespaceId?: string;

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

  @Validate(NotificationReceiverRequiredConstraint)
  receiverRequired?: boolean;
}

export class ListNotificationsRequestDto {
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @Expose({ name: 'namespaceId' })
  namespaceId?: string;

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

export class UpdateNotificationRequestDto {
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsIn(['read'], {
    message: i18nValidationMessage('validation.errors.isIn'),
  })
  status: 'read';
}

export class ClearNotificationsRequestDto {
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
