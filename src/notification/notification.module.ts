import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { InternalNotificationController } from './internal.notification.controller';
import { UserModule } from 'omniboxd/user/user.module';
import { PermissionsModule } from 'omniboxd/permissions/permissions.module';
import { ResourcesModule } from 'omniboxd/resources/resources.module';
import { Notification } from './entities/notification.entity';

@Module({
  controllers: [NotificationController, InternalNotificationController],
  providers: [NotificationService],
  exports: [NotificationService],
  imports: [
    TypeOrmModule.forFeature([Notification]),
    UserModule,
    PermissionsModule,
    ResourcesModule,
  ],
})
export class NotificationModule {}
