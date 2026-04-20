import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';
import {
  ClearNotificationsRequestDto,
  CreateNotificationRequestDto,
  ClearNotificationsResponseDto,
  NotificationDetailResponseDto,
  NotificationItemDto,
  NotificationListResponseDto,
  NotificationUnreadCountResponseDto,
  UpdateNotificationResponseDto,
  UpdateNotificationRequestDto,
} from './dto';
import {
  Notification,
  NotificationStatus,
} from './entities/notification.entity';
import {
  Brackets,
  FindOptionsWhere,
  In,
  IsNull,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';

const NOTIFICATION_RETENTION_DAYS = 30;

interface ListNotificationsOptions {
  namespaceId?: string;
  status?: string;
  tags?: string;
  offset?: number;
  limit?: number;
}

@Injectable()
export class NotificationsService {
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
      userId: createNotificationDto.userId || null,
      namespaceId: createNotificationDto.namespaceId || null,
      title: createNotificationDto.title,
      content: createNotificationDto.content || null,
      status: NotificationStatus.UNREAD,
      notificationType: createNotificationDto.notificationType,
      target: createNotificationDto.target || {},
      tags: createNotificationDto.tags || [],
      attrs: createNotificationDto.attrs || {},
      readedAt: null,
    });

    return await this.notificationRepository.save(notification);
  }

  async list(
    userId: string,
    query: ListNotificationsOptions,
  ): Promise<NotificationListResponseDto> {
    const namespaceId = query.namespaceId;
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 20;
    const status = query.status || 'all';
    const tagList = query.tags
      ?.split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

    const queryBuilder =
      this.notificationRepository.createQueryBuilder('notification');

    if (namespaceId) {
      queryBuilder.where(
        new Brackets((qb) => {
          qb.where(
            'notification.user_id IS NULL AND notification.namespace_id = :namespaceId',
            {
              namespaceId,
            },
          )
            .orWhere(
              'notification.user_id = :userId AND notification.namespace_id IS NULL',
              {
                userId,
              },
            )
            .orWhere(
              'notification.user_id = :userId AND notification.namespace_id = :namespaceId',
              {
                userId,
                namespaceId,
              },
            );
        }),
      );
    } else {
      queryBuilder.where(
        'notification.user_id = :userId AND notification.namespace_id IS NULL',
        {
          userId,
        },
      );
    }

    if (status !== 'all') {
      queryBuilder.andWhere('notification.status = :status', { status });
    }

    if (tagList && tagList.length > 0) {
      queryBuilder.andWhere('notification.tags && :tags', {
        tags: tagList,
      });
    }

    queryBuilder.andWhere('notification.created_at >= :retainedAfter', {
      retainedAfter: this.getRetainedAfter(),
    });

    const [notifications, total] = await queryBuilder
      .orderBy('notification.created_at', 'DESC')
      .skip(offset)
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
      },
    };
  }

  async findOne(
    id: string,
    userId: string,
    namespaceId?: string,
  ): Promise<NotificationDetailResponseDto> {
    const notification = await this.findVisibleNotification(
      id,
      userId,
      namespaceId,
    );

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
    namespaceId?: string,
  ): Promise<NotificationUnreadCountResponseDto> {
    const unreadCount = await this.notificationRepository.count({
      where: this.buildVisibilityWhere(userId, namespaceId, {
        status: NotificationStatus.UNREAD,
      }),
    });

    return {
      unread_count: unreadCount,
    };
  }

  async markAsRead(
    id: string,
    userId: string,
    namespaceId: string | undefined,
    updateNotification: UpdateNotificationRequestDto,
  ): Promise<UpdateNotificationResponseDto> {
    const notification = await this.findVisibleNotification(
      id,
      userId,
      namespaceId,
    );

    if (!notification) {
      const message = this.i18n.t('notification.errors.notificationNotFound');
      throw new AppException(
        message,
        'NOTIFICATION_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }

    const readedAt = notification.readedAt || new Date();
    const saved = await this.notificationRepository.save({
      ...notification,
      status:
        updateNotification.status === 'read'
          ? NotificationStatus.READ
          : notification.status,
      readedAt,
    });

    return {
      id: saved.id,
      status: saved.status,
      readed_at: saved.readedAt.toISOString(),
    };
  }

  async clearUnread(
    userId: string,
    namespaceId: string | undefined,
    clearNotifications: ClearNotificationsRequestDto,
  ): Promise<ClearNotificationsResponseDto> {
    if (clearNotifications.status === 'read') {
      return {
        readed_count: 0,
      };
    }

    const where = this.buildVisibilityWhere(userId, namespaceId, {
      status: NotificationStatus.UNREAD,
      ...(clearNotifications.ids && clearNotifications.ids.length > 0
        ? { id: In(clearNotifications.ids) }
        : {}),
    });

    const notifications = await this.notificationRepository.find({
      where,
    });

    if (notifications.length === 0) {
      return {
        readed_count: 0,
      };
    }

    const readedAt = new Date();
    await this.notificationRepository.save(
      notifications.map((notification) => ({
        ...notification,
        status: NotificationStatus.READ,
        readedAt,
      })),
    );

    return {
      readed_count: notifications.length,
    };
  }

  private buildVisibilityWhere(
    userId: string,
    namespaceId?: string,
    extra: FindOptionsWhere<Notification> = {},
  ): FindOptionsWhere<Notification>[] | FindOptionsWhere<Notification> {
    const retainedAfter = this.getRetainedAfter();

    if (!namespaceId) {
      return {
        createdAt: MoreThanOrEqual(retainedAfter),
        ...extra,
        userId,
        namespaceId: IsNull(),
      };
    }

    return [
      {
        createdAt: MoreThanOrEqual(retainedAfter),
        ...extra,
        userId: IsNull(),
        namespaceId,
      },
      {
        createdAt: MoreThanOrEqual(retainedAfter),
        ...extra,
        userId,
        namespaceId: IsNull(),
      },
      {
        createdAt: MoreThanOrEqual(retainedAfter),
        ...extra,
        userId,
        namespaceId,
      },
    ];
  }

  private async findVisibleNotification(
    id: string,
    userId: string,
    namespaceId?: string,
  ): Promise<Notification | null> {
    return await this.notificationRepository.findOne({
      where: this.buildVisibilityWhere(userId, namespaceId, {
        id,
      }),
    });
  }

  private getRetainedAfter(): Date {
    return new Date(
      Date.now() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
  }
}
