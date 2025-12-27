import { Expose, Transform, Type } from 'class-transformer';
import { UserInvitationDto } from './invitation.dto';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { IsAllowedEmailDomain } from '../../utils/email-validation';

export class SignUpPayloadDto {
  @Expose()
  @Transform(({ value }) => value?.toLowerCase?.())
  @IsString({
    message: i18nValidationMessage('validation.errors.email.isString'),
  })
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

  @Expose()
  @IsOptional()
  @Type(() => UserInvitationDto)
  invitation?: UserInvitationDto;
}
