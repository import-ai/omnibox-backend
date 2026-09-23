import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';

import { IpRateLimitGuard } from './ip-rate-limit.guard';
import { RATE_LIMIT_BY_IP_KEY } from './rate-limit.constants';

/**
 * Throttle a handler per client IP (fixed window, Redis-backed).
 *
 * Nest runs handler guards in registration order, and `@UseGuards` appends to
 * the handler's guard metadata while TypeScript applies decorators bottom-up.
 * So on the OTP endpoints this decorator is written BELOW `@RequireCaptcha()`,
 * which registers it first and makes it run before the paid Aliyun
 * verification.
 */
export const RateLimitByIp = () =>
  applyDecorators(
    SetMetadata(RATE_LIMIT_BY_IP_KEY, true),
    UseGuards(IpRateLimitGuard),
  );
