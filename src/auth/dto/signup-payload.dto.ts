import { Expose, Type } from 'class-transformer';
import { UserInvitationDto } from './invitation.dto';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class SignUpPayloadDto {
  @Expose()
  @IsString({
    message: i18nValidationMessage('validation.errors.email.isString'),
  })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.email.isNotEmpty'),
  })
  email: string;

  @Expose()
  @IsOptional()
  @Type(() => UserInvitationDto)
  invitation?: UserInvitationDto;
}
