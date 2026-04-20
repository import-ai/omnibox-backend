import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { InternalNotificationsController } from './internal.notifications.controller';
import { UserModule } from 'omniboxd/user/user.module';
import { PermissionsModule } from 'omniboxd/permissions/permissions.module';
import { ResourcesModule } from 'omniboxd/resources/resources.module';
import { Notification } from './entities/notification.entity';

@Module({
  controllers: [NotificationsController, InternalNotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
  imports: [
    TypeOrmModule.forFeature([Notification]),
    UserModule,
    PermissionsModule,
    ResourcesModule,
  ],
})
export class NotificationsModule {}
