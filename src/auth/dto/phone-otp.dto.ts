import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Length } from 'class-validator';
import { IsValidPhone } from 'omniboxd/common/validators';

export class SendPhoneOtpDto {
  @ApiProperty({
    description: 'Phone number with country code (E.164 format)',
    example: '+8613800138000',
  })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.replace(/\s/g, ''))
  @IsValidPhone(undefined, {
    message:
      'Phone number must be in valid E.164 format (e.g., +8613800138000)',
  })
  phone: string;
}

export class VerifyPhoneOtpDto extends SendPhoneOtpDto {
  @ApiProperty({
    description: '6-digit verification code',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
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
