import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';

import {
  CreateNotificationRequestDto,
  CreateSystemNotificationRequestDto,
} from './dto';
import {
  NotificationAssetsService,
  SYSTEM_NOTIFICATION_ASSET_MAX_SIZE,
} from './notification-assets.service';
import { NotificationsService } from './notifications.service';

@Controller('internal/api/v1')
export class InternalNotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly notificationAssetsService: NotificationAssetsService,
  ) {}

  @Public()
  @Post('notifications')
  async create(@Body() dto: CreateNotificationRequestDto) {
    const notification = await this.notificationsService.createInternal(dto);
    return {
      id: notification.id,
      status: notification.status,
    };
  }

  @Public()
  @Post('system-notifications')
  async createSystemNotification(
    @Body() dto: CreateSystemNotificationRequestDto,
  ) {
    const notification =
      await this.notificationsService.createSystemNotification(dto);
    return {
      id: notification.id,
      status: notification.status,
    };
  }

  @Public()
  @Post('system-notifications/assets')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: SYSTEM_NOTIFICATION_ASSET_MAX_SIZE },
    }),
  )
  async uploadSystemNotificationAsset(
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return await this.notificationAssetsService.upload(file);
  }

  @Public()
  @Get('system-notification-assets/:assetName')
  async getSystemNotificationAsset(
    @Param('assetName') assetName: string,
    @Res() response: Response,
  ): Promise<void> {
    await this.notificationAssetsService.pipeToResponse(assetName, response);
  }
}
