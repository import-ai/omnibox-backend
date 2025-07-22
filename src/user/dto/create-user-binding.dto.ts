import { IsString } from 'class-validator';

export class CreateUserBindingDto {
  @IsString()
  loginId: string;

  @IsString()
  loginType: string;
}
