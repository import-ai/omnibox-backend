import { ConfigService } from '@nestjs/config';
import { ThrottlerOptions } from '@nestjs/throttler';

import {
  IP_RATE_LIMIT_MAX_DEFAULT,
  IP_RATE_LIMIT_MAX_ENV,
  IP_RATE_LIMIT_WINDOW_MS_DEFAULT,
  IP_RATE_LIMIT_WINDOW_MS_ENV,
  OTP_THROTTLER_NAME,
} from './rate-limit.constants';

export const readPositiveInt = (
  config: ConfigService,
  key: string,
  fallback: number,
): number => {
  const raw = config.get<string>(key);
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/** The single throttler the OTP send endpoints are limited by. */
export const otpThrottlerOptions = (
  config: ConfigService,
): ThrottlerOptions => ({
  name: OTP_THROTTLER_NAME,
  limit: readPositiveInt(
    config,
    IP_RATE_LIMIT_MAX_ENV,
    IP_RATE_LIMIT_MAX_DEFAULT,
  ),
  ttl: readPositiveInt(
    config,
    IP_RATE_LIMIT_WINDOW_MS_ENV,
    IP_RATE_LIMIT_WINDOW_MS_DEFAULT,
  ),
});
