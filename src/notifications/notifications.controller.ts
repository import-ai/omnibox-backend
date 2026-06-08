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

import {
  ClearNotificationsRequestDto,
  UpdateNotificationRequestDto,
} from './dto';
import { NotificationsService } from './notifications.service';

@Controller('api/v1/notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async findAll(
    @UserId() userId: string,
    @Query('namespaceId') namespaceId?: string,
    @Query('status') status?: string,
    @Query('tags') tags?: string,
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
  ) {
    return await this.notificationsService.list(userId, {
      namespaceId,
      status: status || 'all',
      tags,
      offset: Number.isFinite(Number(offset)) ? Number(offset) : 0,
      limit: Number.isFinite(Number(limit)) ? Number(limit) : 20,
    });
  }

  @Get('unread/count')
  async getUnreadCount(
    @UserId() userId: string,
    @Query('namespaceId') namespaceId: string | undefined,
  ) {
    return await this.notificationsService.getUnreadCount(userId, namespaceId);
  }

  @Post('unread/clear')
  async clearUnread(
    @UserId() userId: string,
    @Body() clearNotifications: ClearNotificationsRequestDto,
    @Query('namespaceId') namespaceId: string | undefined,
  ) {
    return await this.notificationsService.clearUnread(
      userId,
      namespaceId,
      clearNotifications,
    );
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @UserId() userId: string,
    @Query('namespaceId') namespaceId: string | undefined,
  ) {
    return await this.notificationsService.findOne(id, userId, namespaceId);
  }

  @Patch(':id')
  async patch(
    @Param('id') id: string,
    @UserId() userId: string,
    @Body() updateNotification: UpdateNotificationRequestDto,
    @Query('namespaceId') namespaceId: string | undefined,
  ) {
    return await this.notificationsService.markAsRead(
      id,
      userId,
      namespaceId,
      updateNotification,
    );
  }
}
