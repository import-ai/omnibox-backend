import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Length } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { IsValidPhone } from 'omniboxd/common/validators';

export class SendPhoneOtpRequestDto {
  @ApiProperty({
    description: 'Phone number with country code (E.164 format)',
    example: '+8613800138000',
  })
  @IsString()
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.phone.isNotEmpty'),
  })
  @Transform(({ value }) => value?.replace(/\s/g, ''))
  @IsValidPhone(undefined, {
    message: i18nValidationMessage('validation.errors.phone.invalid'),
  })
  phone: string;
}

export class VerifyPhoneOtpRequestDto extends SendPhoneOtpRequestDto {
  @ApiProperty({
    description: '6-digit verification code',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.code.isNotEmpty'),
  })
  @Length(6, 6, {
    message: i18nValidationMessage('validation.errors.code.length'),
  })
  code: string;
}

export class SendPhoneOtpResponseDto {
  @ApiProperty({
    description: 'Whether the phone number exists (registered user)',
  })
  exists: boolean;

  @ApiProperty({
    description: 'Whether the OTP was sent successfully',
  })
  sent: boolean;
}
