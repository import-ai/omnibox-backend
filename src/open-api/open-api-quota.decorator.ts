import { SetMetadata } from '@nestjs/common';

export const SKIP_OPEN_API_QUOTA = 'skipOpenAPIQuota';

export const SkipOpenAPIQuota = () => SetMetadata(SKIP_OPEN_API_QUOTA, true);
