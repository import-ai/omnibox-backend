import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { IsAllowedEmailDomain } from '../../utils/email-validation';

export class SendEmailOtpDto {
  @ApiProperty({
    description: 'Email address to send OTP to',
    example: 'user@example.com',
  })
  @Transform(({ value }) => value?.toLowerCase?.())
  @IsEmail()
  @IsNotEmpty()
  @IsAllowedEmailDomain({
    message: i18nValidationMessage('validation.errors.email.domainNotAllowed'),
  })
  email: string;
}

export class VerifyEmailOtpDto {
  @ApiProperty({
    description: 'Email address',
    example: 'user@example.com',
  })
  @Transform(({ value }) => value?.toLowerCase?.())
  @IsEmail()
  @IsNotEmpty()
  @IsAllowedEmailDomain({
    message: i18nValidationMessage('validation.errors.email.domainNotAllowed'),
  })
  email: string;

  @ApiProperty({
    description: '6-digit verification code',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  code: string;
}

export class SendEmailOtpResponseDto {
  @ApiProperty({
    description: 'Whether the email exists (registered user)',
  })
  exists: boolean;

  @ApiProperty({
    description: 'Whether the OTP was sent successfully',
  })
  sent: boolean;
}
