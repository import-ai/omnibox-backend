import { Expose, Type } from 'class-transformer';
import { InvitationDto } from './invitation.dto';
import { IsNotEmpty, IsString } from 'class-validator';

export class InvitePayloadDto {
  @Expose()
  @IsString()
  @IsNotEmpty()
  userId: string;

  @Expose()
  @Type(() => InvitationDto)
  invitation: InvitationDto;
}
