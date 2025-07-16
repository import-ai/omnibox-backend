import { IsString, IsOptional, IsNumber } from 'class-validator';

export class WechatQrcodeResponseDto {
  @IsString()
  state: string;

  @IsString()
  qrcode: string;

  @IsNumber()
  expiresIn: number;
}

export class WechatCheckResponseDto {
  @IsString()
  status: 'pending' | 'success' | 'expired';

  user?: {
    id: string;
    username: string;
    access_token: string;
  };
}

export class WechatCallbackDto {
  @IsString()
  code: string;

  @IsString()
  state: string;
}

export class WechatLoginDto {
  @IsString()
  type: string;

  @IsOptional()
  @IsString()
  userAgent?: string;
}
