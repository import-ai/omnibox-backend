import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { IpRateLimitGuard } from './ip-rate-limit.guard';
import { RateLimitCounter } from './rate-limit-counter.service';

@Module({
  imports: [ConfigModule],
  providers: [RateLimitCounter, IpRateLimitGuard],
  exports: [IpRateLimitGuard],
})
export class RateLimitModule {}
