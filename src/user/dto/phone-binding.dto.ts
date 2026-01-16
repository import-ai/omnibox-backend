import { IsNotEmpty, IsString, Length } from 'class-validator';
import { Transform } from 'class-transformer';
import { i18nValidationMessage } from 'nestjs-i18n';
import { IsValidPhone } from 'omniboxd/common/validators';

/**
 * Normalize phone number by removing whitespace.
 * Expects E.164 format from frontend (e.g., +8613912345678).
 */
const normalizePhone = (value: string) => {
  if (!value) return value;
  return value.replace(/\s/g, '');
};

export class SendPhoneCodeRequestDto {
  @IsString()
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.phone.isNotEmpty'),
  })
  @Transform(({ value }) => normalizePhone(value))
  @IsValidPhone(undefined, {
    message: i18nValidationMessage('validation.errors.phone.invalid'),
  })
  phone: string;
}

export class BindPhoneRequestDto extends SendPhoneCodeRequestDto {
  @IsString()
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.code.isNotEmpty'),
  })
  @Length(6, 6, {
    message: i18nValidationMessage('validation.errors.code.length'),
  })
  code: string;
}
