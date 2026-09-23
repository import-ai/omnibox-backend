import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { IpRateLimitGuard } from './ip-rate-limit.guard';
import { RateLimitCounter } from './rate-limit-counter.service';

@Module({
  imports: [ConfigModule],
  providers: [RateLimitCounter, IpRateLimitGuard],
  // The guard is instantiated in the injector of whichever module declares the
  // controller using it, so its dependencies must be exported alongside it.
  exports: [IpRateLimitGuard, RateLimitCounter],
})
export class RateLimitModule {}
