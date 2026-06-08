import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheService } from 'omniboxd/common/cache.service';
import { UserBinding } from 'omniboxd/user/entities/user-binding.entity';

import { InternalSubscribeMessageController } from './internal.subscribe-message.controller';
import { SubscribeMessageService } from './subscribe-message.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserBinding])],
  controllers: [InternalSubscribeMessageController],
  providers: [SubscribeMessageService, CacheService],
  exports: [SubscribeMessageService],
})
export class SubscribeMessageModule {}
