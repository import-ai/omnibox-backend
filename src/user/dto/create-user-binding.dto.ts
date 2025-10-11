import { IsOptional, IsEmail, IsString } from 'class-validator';

export class CreateUserBindingDto {
  @IsString()
  loginId: string;

  @IsString()
  loginType: string;

  @IsString()
  username: string;

  @IsEmail()
  @IsOptional()
  email: string;

  @IsString()
  @IsOptional()
  lang?: string;
}
