import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheService } from 'omniboxd/common/cache.service';

import { IpRateLimitGuard } from './ip-rate-limit.guard';

@Module({
  imports: [ConfigModule],
  providers: [CacheService, IpRateLimitGuard],
  exports: [IpRateLimitGuard],
})
export class RateLimitModule {}
