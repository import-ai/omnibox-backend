import { Expose } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class NotificationSendRequestDto {
  @Expose({ name: 'user_id' })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @Expose()
  @IsString()
  @IsNotEmpty()
  title: string;

  @Expose()
  @IsString()
  @IsNotEmpty()
  content: string;

  @Expose()
  @IsOptional()
  extras?: Record<string, any>;
}
