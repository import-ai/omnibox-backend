import { IsNotEmpty, IsString, IsUrl } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class CompressedCollectRequestDto {
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    {
      message: i18nValidationMessage('validation.errors.url.isUrl'),
    },
  )
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.url.isNotEmpty'),
  })
  url: string;

  @IsString({
    message: i18nValidationMessage('validation.errors.title.isString'),
  })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.title.isNotEmpty'),
  })
  title: string;

  @IsString({
    message: i18nValidationMessage('validation.errors.parentId.isString'),
  })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.parentId.isNotEmpty'),
  })
  parentId: string;
}
