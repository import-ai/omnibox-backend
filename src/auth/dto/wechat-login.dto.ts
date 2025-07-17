import { IsString } from 'class-validator';

export class WechatCheckResponseDto {
  @IsString()
  status: 'pending' | 'success' | 'expired';

  user?: {
    id: string;
    access_token: string;
  };
}
