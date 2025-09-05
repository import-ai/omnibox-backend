import { Expose } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsDate,
  IsInt,
} from 'class-validator';
import { ShareType } from '../entities/share.entity';

export class UpdateShareInfoReqDto {
  @IsOptional()
  @IsBoolean()
  @Expose({ name: 'enabled' })
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  @Expose({ name: 'all_resources' })
  allResources?: boolean;

  @IsOptional()
  @IsBoolean()
  @Expose({ name: 'require_login' })
  requireLogin?: boolean;

  @IsOptional()
  @IsString()
  @Expose({ name: 'password' })
  password?: string | null;

  @IsOptional()
  @IsEnum(ShareType)
  @Expose({ name: 'share_type' })
  shareType?: ShareType;

  @IsOptional()
  @IsDate()
  @Expose({ name: 'expires_at' })
  expiresAt?: Date | null;

  @IsOptional()
  @IsInt()
  @Expose({ name: 'expires_seconds' })
  expiresSeconds?: number;
}
