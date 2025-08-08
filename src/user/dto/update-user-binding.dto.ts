import { IsString } from 'class-validator';

export class UpdateUserBindingDto {
  @IsString()
  loginId: string;

  @IsString()
  loginType: string;

  @IsString()
  userId: string;
}
