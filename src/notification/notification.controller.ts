import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { ClearNotificationsDto, UpdateNotificationDto } from './dto';
import { NotificationService } from './notification.service';

@Controller('api/v1/notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  async findAll(
    @UserId() userId: string,
    @Query('status') status?: string,
    @Query('tags') tags?: string,
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
  ) {
    return await this.notificationService.list(userId, {
      status: status || 'all',
      tags,
      offset: Number.isFinite(Number(offset)) ? Number(offset) : 1,
      limit: Number.isFinite(Number(limit)) ? Number(limit) : 20,
    });
  }

  @Get('unread/count')
  async getUnreadCount(@UserId() userId: string) {
    return await this.notificationService.getUnreadCount(userId);
  }

  @Post('unread/clear')
  async clearUnread(
    @UserId() userId: string,
    @Body() clearNotificationsDto: ClearNotificationsDto,
  ) {
    return await this.notificationService.clearUnread(
      userId,
      clearNotificationsDto,
    );
  }

  @Get(':id/action')
  async getAction(@Param('id') id: string, @UserId() userId: string) {
    return await this.notificationService.getAction(id, userId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @UserId() userId: string) {
    return await this.notificationService.findOne(id, userId);
  }

  @Patch(':id')
  async patch(
    @Param('id') id: string,
    @UserId() userId: string,
    @Body() updateNotificationDto: UpdateNotificationDto,
  ) {
    return await this.notificationService.markAsRead(
      id,
      userId,
      updateNotificationDto,
    );
  }
}
