import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionsModule } from 'omniboxd/permissions/permissions.module';
import { ResourcesModule } from 'omniboxd/resources/resources.module';
import { S3Module } from 'omniboxd/s3/s3.module';
import { UserModule } from 'omniboxd/user/user.module';

import { Notification, NotificationRead } from './entities/notification.entity';
import { InternalNotificationsController } from './internal.notifications.controller';
import { NotificationAssetsController } from './notification-assets.controller';
import { NotificationAssetsService } from './notification-assets.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [
    NotificationsController,
    InternalNotificationsController,
    NotificationAssetsController,
  ],
  providers: [NotificationsService, NotificationAssetsService],
  exports: [NotificationsService],
  imports: [
    TypeOrmModule.forFeature([Notification, NotificationRead]),
    UserModule,
    PermissionsModule,
    ResourcesModule,
    S3Module,
  ],
})
export class NotificationsModule {}
