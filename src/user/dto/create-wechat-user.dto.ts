import { IsString } from 'class-validator';

export class CreateWechatUserDto {
  @IsString()
  loginId: string;

  @IsString()
  username: string;

  @IsString()
  loginType: string;
}
