import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { i18nValidationMessage } from 'nestjs-i18n';

// Transform E164 format to national number for CN (+8613912345678 -> 13912345678)
const normalizePhone = (value: string) => {
  if (!value) return value;
  // Remove whitespace
  let phone = value.replace(/\s/g, '');
  // Strip +86 prefix if present
  if (phone.startsWith('+86')) {
    phone = phone.slice(3);
  }
  return phone;
};

export class SendPhoneCodeDto {
  @IsString()
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.phone.isNotEmpty'),
  })
  @Transform(({ value }) => normalizePhone(value))
  @Matches(/^1[3-9]\d{9}$/, {
    message: i18nValidationMessage('validation.errors.phone.invalid'),
  })
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
