import { Expose, Type } from 'class-transformer';
import { InvitationDto } from './invitation.dto';
import { IsNotEmpty, IsString } from 'class-validator';

export class SignUpPayloadDto {
  @Expose()
  @IsString()
  @IsNotEmpty()
  email: string;

  @Expose()
  @Type(() => InvitationDto)
  invitation: InvitationDto;
}
