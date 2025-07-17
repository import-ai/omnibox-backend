import { IsString } from 'class-validator';

export class CreateUserBindingDto {
  @IsString()
  loginId: string;

  @IsString()
  username: string;

  @IsString()
  loginType: string;
}
