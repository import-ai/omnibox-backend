import { IsString } from 'class-validator';

export class GoogleAuthResponseDto {
  @IsString()
  status: 'pending' | 'success' | 'expired';

  user?: {
    id: string;
    access_token: string;
  };
}
