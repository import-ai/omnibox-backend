import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscribeMessageService } from './subscribe-message.service';
import { SubscribeMessageController } from './subscribe-message.controller';
import { CacheService } from 'omniboxd/common/cache.service';
import { UserBinding } from 'omniboxd/user/entities/user-binding.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UserBinding])],
  controllers: [SubscribeMessageController],
  providers: [SubscribeMessageService, CacheService],
  exports: [SubscribeMessageService],
})
export class SubscribeMessageModule {}
