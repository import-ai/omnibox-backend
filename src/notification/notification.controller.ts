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
import { NotificationService } from './notification.service';

@Controller('api/v1/notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  async findAll(
    @UserId() userId: string,
    @Query('namespaceId') namespaceId?: string,
    @Query('status') status?: string,
    @Query('tags') tags?: string,
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
  ) {
    return await this.notificationService.list(userId, {
      namespaceId,
      status: status || 'all',
      tags,
      offset: Number.isFinite(Number(offset)) ? Number(offset) : 1,
      limit: Number.isFinite(Number(limit)) ? Number(limit) : 20,
    });
  }

  @Get('unread/count')
  async getUnreadCount(
    @UserId() userId: string,
    @Query('namespaceId') namespaceId: string | undefined,
  ) {
    return await this.notificationService.getUnreadCount(userId, namespaceId);
  }

  @Post('unread/clear')
  async clearUnread(
    @UserId() userId: string,
    @Body() ClearNotificationsRequestDto: ClearNotificationsRequestDto,
    @Query('namespaceId') namespaceId: string | undefined,
  ) {
    return await this.notificationService.clearUnread(
      userId,
      namespaceId,
      ClearNotificationsRequestDto,
    );
  }

  @Get(':id/action')
  async getAction(
    @Param('id') id: string,
    @UserId() userId: string,
    @Query('namespaceId') namespaceId: string | undefined,
  ) {
    return await this.notificationService.getAction(id, userId, namespaceId);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @UserId() userId: string,
    @Query('namespaceId') namespaceId: string | undefined,
  ) {
    return await this.notificationService.findOne(id, userId, namespaceId);
  }

  @Patch(':id')
  async patch(
    @Param('id') id: string,
    @UserId() userId: string,
    @Body() UpdateNotificationRequestDto: UpdateNotificationRequestDto,
    @Query('namespaceId') namespaceId: string | undefined,
  ) {
    return await this.notificationService.markAsRead(
      id,
      userId,
      namespaceId,
      UpdateNotificationRequestDto,
    );
  }
}
