import { ShareType } from '../entities/share.entity';

export class UpdateShareInfoReqDto {
  enabled?: boolean;
  all_resources?: boolean;
  require_login?: boolean;
  password?: string | null;
  share_type?: ShareType;
  expires_at?: Date | null;
  expires_seconds?: number;
}
