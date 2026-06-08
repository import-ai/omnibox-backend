import { Expose, Type } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

import { UserInvitationDto } from './invitation.dto';

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
