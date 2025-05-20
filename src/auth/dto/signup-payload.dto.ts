import { Expose, Type } from 'class-transformer';
import { InvitationDto } from './invitation.dto';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SignUpPayloadDto {
  @Expose()
  @IsString()
  @IsNotEmpty()
  email: string;

  @Expose()
  @IsOptional()
  @Type(() => InvitationDto)
  invitation?: InvitationDto;
}
