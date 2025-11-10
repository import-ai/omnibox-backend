import { IsNotEmpty, IsString } from 'class-validator';
import { Expose } from 'class-transformer';
import { i18nValidationMessage } from 'nestjs-i18n';

export class GroupUserDto {
  @Expose()
  @IsString({
    message: i18nValidationMessage('validation.errors.id.isString'),
  })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.id.isNotEmpty'),
  })
  id: string;

  @Expose()
  @IsString({
    message: i18nValidationMessage('validation.errors.username.isString'),
  })
  username: string;

  @Expose()
  @IsString({
    message: i18nValidationMessage('validation.errors.email.isString'),
  })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.email.isNotEmpty'),
  })
  email: string;

  @Expose()
  @IsString({
    message: i18nValidationMessage('validation.errors.role.isString'),
  })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.role.isNotEmpty'),
  })
  role: string;
}
