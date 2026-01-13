import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { i18nValidationMessage } from 'nestjs-i18n';

export class SendPhoneCodeDto {
  @IsString()
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.phone.isNotEmpty'),
  })
  @Matches(/^1[3-9]\d{9}$/, {
    message: i18nValidationMessage('validation.errors.phone.invalid'),
  })
  @Transform(({ value }) => value?.replace(/\s/g, ''))
  phone: string;
}

export class BindPhoneDto extends SendPhoneCodeDto {
  @IsString()
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.code.isNotEmpty'),
  })
  @Length(6, 6, {
    message: i18nValidationMessage('validation.errors.code.length'),
  })
  code: string;
}
