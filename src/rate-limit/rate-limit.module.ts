import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ContactRateLimiter } from './contact-rate-limiter.service';
import { OtpThrottlerGuard } from './otp-throttler.guard';

@Module({
  imports: [ConfigModule],
  providers: [ContactRateLimiter, OtpThrottlerGuard],
  exports: [ContactRateLimiter, OtpThrottlerGuard],
})
export class RateLimitModule {}
