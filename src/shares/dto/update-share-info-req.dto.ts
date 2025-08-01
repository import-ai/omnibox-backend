import { ShareType } from '../entities/share.entity';

export class UpdateShareInfoReqDto {
  enabled?: boolean;
  requireLogin?: boolean;
  password?: string | null;
  shareType?: ShareType;
  expiresAt?: Date | null;
}
