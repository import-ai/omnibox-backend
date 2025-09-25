import { IsOptional, IsString } from 'class-validator';

export class CreateUserBindingDto {
  @IsString()
  loginId: string;

  @IsString()
  loginType: string;

  @IsString()
  username: string;

  @IsString()
  @IsOptional()
  lang?: string;
}
