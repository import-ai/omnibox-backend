import { Expose, Type } from 'class-transformer';
import { UserInvitationDto } from './invitation.dto';
import { IsNotEmpty, IsString } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class InvitePayloadDto {
  @Expose()
  @IsString({
    message: i18nValidationMessage('validation.errors.userId.isString'),
  })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.userId.isNotEmpty'),
  })
  userId: string;

  @Expose()
  @Type(() => UserInvitationDto)
  invitation: UserInvitationDto;
}
