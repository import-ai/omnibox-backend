import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionsModule } from 'omniboxd/permissions/permissions.module';
import { ResourcesModule } from 'omniboxd/resources/resources.module';
import { UserModule } from 'omniboxd/user/user.module';

import { Notification, NotificationRead } from './entities/notification.entity';
import { InternalNotificationsController } from './internal.notifications.controller';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [NotificationsController, InternalNotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
  imports: [
    TypeOrmModule.forFeature([Notification, NotificationRead]),
    UserModule,
    PermissionsModule,
    ResourcesModule,
  ],
})
export class NotificationsModule {}
