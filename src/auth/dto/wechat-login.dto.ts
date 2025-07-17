import { IsString } from 'class-validator';

export class WechatQrcodeResponseDto {
  @IsString()
  state: string;

  @IsString()
  data: string;
}

export class WechatCheckResponseDto {
  @IsString()
  status: 'pending' | 'success' | 'expired';

  user?: {
    id: string;
    access_token: string;
  };
}
