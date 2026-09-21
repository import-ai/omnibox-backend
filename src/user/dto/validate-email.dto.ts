import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { IsAllowedEmailDomain } from 'omniboxd/utils/email-validation';

export class ValidateEmailDto {
  @Transform(({ value }) => value?.toLowerCase?.())
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.email.isNotEmpty'),
  })
  @IsEmail(
    {},
    { message: i18nValidationMessage('validation.errors.email.isEmail') },
  )
  @IsAllowedEmailDomain({
    message: i18nValidationMessage('validation.errors.email.domainNotAllowed'),
  })
  email: string;

  @ApiProperty({
    description:
      'Aliyun Captcha 2.0 verify param produced by the client SDK (required when captcha is enabled)',
    required: false,
  })
  @IsOptional()
  @IsString()
  captcha_verify_param?: string;
}
