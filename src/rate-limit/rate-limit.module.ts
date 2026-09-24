import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { OtpThrottlerGuard } from './otp-throttler.guard';

@Module({
  imports: [ConfigModule],
  providers: [OtpThrottlerGuard],
  exports: [OtpThrottlerGuard],
})
export class RateLimitModule {}
