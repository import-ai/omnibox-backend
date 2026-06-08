import { Body, Controller, Post } from '@nestjs/common';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';

import { CreateNotificationRequestDto } from './dto';
import { NotificationsService } from './notifications.service';

@Controller('internal/api/v1')
export class InternalNotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Public()
  @Post('notifications')
  async create(@Body() dto: CreateNotificationRequestDto) {
    const notification = await this.notificationsService.createInternal(dto);
    return {
      id: notification.id,
      status: notification.status,
    };
  }
}
