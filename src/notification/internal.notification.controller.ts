import { Body, Controller, Post } from '@nestjs/common';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';
import { CreateNotificationRequestDto } from './dto';
import { NotificationService } from './notification.service';

@Controller('internal/api/v1')
export class InternalNotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Public()
  @Post('notifications')
  async create(@Body() dto: CreateNotificationRequestDto) {
    const notification = await this.notificationService.createInternal(dto);
    return {
      id: notification.id,
      status: notification.status,
    };
  }
}
