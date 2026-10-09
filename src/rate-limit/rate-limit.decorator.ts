import { UseGuards } from '@nestjs/common';

import { OtpThrottlerGuard } from './otp-throttler.guard';

/**
 * Throttle a handler per client IP (fixed window, Redis-backed).
 *
 * Nest runs handler guards in registration order, and `@UseGuards` appends to
 * the handler's guard metadata while TypeScript applies decorators bottom-up.
 * So on the OTP endpoints this decorator is written BELOW `@RequireCaptcha()`,
 * which registers it first and makes it run before the paid Aliyun
 * verification.
 */
export const RateLimitByIp = () => UseGuards(OtpThrottlerGuard);
