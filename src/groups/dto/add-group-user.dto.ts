import { IsString, IsArray } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class AddGroupUserDto {
  @IsArray({ message: i18nValidationMessage('validation.errors.isArray') })
  @IsString({
    each: true,
    message: i18nValidationMessage('validation.errors.isString'),
  })
  userIds: string[];
}
