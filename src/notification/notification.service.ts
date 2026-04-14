import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';
import {
  ClearNotificationsDto,
  CreateNotificationRequestDto,
  ClearNotificationsResponseDto,
  NotificationActionResponseDto,
  NotificationDetailResponseDto,
  NotificationItemDto,
  NotificationListResponseDto,
  NotificationUnreadCountResponseDto,
  UpdateNotificationResponseDto,
  UpdateNotificationDto,
} from './dto';
import {
  Notification,
  NotificationStatus,
} from './entities/notification.entity';
import { In, Repository } from 'typeorm';

interface ListNotificationsOptions {
  status?: string;
  tags?: string;
  offset?: number;
  limit?: number;
}

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    private readonly i18n: I18nService,
  ) {}

  /**
   * Write the notification into the notification database
   */
  async createInternal(createNotificationDto: CreateNotificationRequestDto) {
    const notification = this.notificationRepository.create({
      userId: createNotificationDto.userId,
      title: createNotificationDto.title,
      content: createNotificationDto.content || null,
      status:
        createNotificationDto.status === 'read'
          ? NotificationStatus.READ
          : NotificationStatus.UNREAD,
      actionType: createNotificationDto.actionType,
      target: createNotificationDto.target || {},
      tags: createNotificationDto.tags || [],
      attrs: createNotificationDto.attrs || {},
      readAt: createNotificationDto.status === 'read' ? new Date() : null,
    });

    return await this.notificationRepository.save(notification);
  }

  async list(
    userId: string,
    query: ListNotificationsOptions,
  ): Promise<NotificationListResponseDto> {
    const offset = query.offset || 1;
    const limit = query.limit || 20;
    const status = query.status || 'all';
    const tagList = query.tags
      ?.split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

    const queryBuilder = this.notificationRepository
      .createQueryBuilder('notification')
      .where('notification.user_id = :userId', { userId });

    if (status !== 'all') {
      queryBuilder.andWhere('notification.status = :status', { status });
    }

    if (tagList && tagList.length > 0) {
      queryBuilder.andWhere('notification.tags && :tags', {
        tags: tagList,
      });
    }

    const [notifications, total] = await queryBuilder
      .orderBy('notification.created_at', 'DESC')
      .skip((offset - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      list: notifications.map((notification) =>
        NotificationItemDto.fromEntity(notification),
      ),
      pagination: {
        offset,
        limit,
        total,
        hasMore: offset * limit < total,
      },
    };
  }

  async findOne(
    id: string,
    userId: string,
  ): Promise<NotificationDetailResponseDto> {
    const notification = await this.notificationRepository.findOne({
      where: {
        id,
        userId,
      },
    });

    if (!notification) {
      const message = this.i18n.t('notification.errors.notificationNotFound');
      throw new AppException(
        message,
        'NOTIFICATION_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }

    return NotificationDetailResponseDto.fromEntity(notification);
  }

  async getUnreadCount(
    userId: string,
  ): Promise<NotificationUnreadCountResponseDto> {
    const unreadCount = await this.notificationRepository.count({
      where: {
        userId,
        status: NotificationStatus.UNREAD,
      },
    });

    return {
      unreadCount,
    };
  }

  async markAsRead(
    id: string,
    userId: string,
    updateNotificationDto: UpdateNotificationDto,
  ): Promise<UpdateNotificationResponseDto> {
    const notification = await this.notificationRepository.findOne({
      where: {
        id,
        userId,
      },
    });

    if (!notification) {
      const message = this.i18n.t('notification.errors.notificationNotFound');
      throw new AppException(
        message,
        'NOTIFICATION_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }

    const readAt = notification.readAt || new Date();
    const saved = await this.notificationRepository.save({
      ...notification,
      status:
        updateNotificationDto.status === 'read'
          ? NotificationStatus.READ
          : notification.status,
      readAt,
    });

    return {
      id: saved.id,
      status: saved.status,
      readAt: saved.readAt.toISOString(),
    };
  }

  async clearUnread(
    userId: string,
    clearNotificationsDto: ClearNotificationsDto,
  ): Promise<ClearNotificationsResponseDto> {
    if (clearNotificationsDto.status === 'read') {
      return {
        readedCount: 0,
      };
    }

    const where: {
      userId: string;
      status: NotificationStatus;
      id?: ReturnType<typeof In>;
    } = {
      userId,
      status: NotificationStatus.UNREAD,
    };

    if (clearNotificationsDto.ids && clearNotificationsDto.ids.length > 0) {
      where.id = In(clearNotificationsDto.ids);
    }

    const notifications = await this.notificationRepository.find({
      where,
    });

    if (notifications.length === 0) {
      return {
        readedCount: 0,
      };
    }

    const readAt = new Date();
    await this.notificationRepository.save(
      notifications.map((notification) => ({
        ...notification,
        status: NotificationStatus.READ,
        readAt,
      })),
    );

    return {
      readedCount: notifications.length,
    };
  }

  async getAction(
    id: string,
    userId: string,
  ): Promise<NotificationActionResponseDto> {
    const notification = await this.notificationRepository.findOne({
      where: {
        id,
        userId,
      },
    });

    if (!notification) {
      const message = this.i18n.t('notification.errors.notificationNotFound');
      throw new AppException(
        message,
        'NOTIFICATION_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }

    return NotificationActionResponseDto.fromEntity(notification);
  }
}
