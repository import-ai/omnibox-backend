import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APIKeyModule } from 'omniboxd/api-key/api-key.module';
import { NamespacesModule } from 'omniboxd/namespaces/namespaces.module';
import { NotificationsModule } from 'omniboxd/notifications/notifications.module';

import { ApplicationsController } from './applications.controller';
import { Applications } from './applications.entity';
import { ApplicationsService } from './applications.service';
import { QQBot } from './apps/qq-bot';
import { WechatBot } from './apps/wechat-bot';
import { WechatClaw } from './apps/wechat-claw';
import { InternalApplicationsController } from './internal.applications.controller';

@Module({
  providers: [ApplicationsService, WechatBot, QQBot, WechatClaw],
  controllers: [ApplicationsController, InternalApplicationsController],
  exports: [ApplicationsService],
  imports: [
    TypeOrmModule.forFeature([Applications]),
    APIKeyModule,
    NamespacesModule,
    NotificationsModule,
  ],
})
export class ApplicationsModule {}
