import { IsNotEmpty, IsString } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class CreateGroupDto {
  @IsString({
    message: i18nValidationMessage('validation.errors.title.isString'),
  })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.title.isNotEmpty'),
  })
  title: string;
}
