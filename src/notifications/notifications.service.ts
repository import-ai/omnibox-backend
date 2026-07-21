import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import {
  Brackets,
  QueryFailedError,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';

import {
  ClearNotificationsRequestDto,
  ClearNotificationsResponseDto,
  CreateNotificationRequestDto,
  CreateSystemNotificationRequestDto,
  NotificationDetailResponseDto,
  NotificationItemDto,
  NotificationListResponseDto,
  NotificationUnreadCountResponseDto,
  UpdateNotificationRequestDto,
  UpdateNotificationResponseDto,
} from './dto';
import {
  Notification,
  NotificationRead,
  NotificationStatus,
} from './entities/notification.entity';

const NOTIFICATION_RETENTION_DAYS = 30;

interface ListNotificationsOptions {
  namespaceId?: string;
  status?: 'all' | 'unread' | 'read';
  tags?: string;
  offset?: number;
  limit?: number;
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(NotificationRead)
    private readonly notificationReadRepository: Repository<NotificationRead>,
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
      summary: null,
      status: NotificationStatus.UNREAD,
      notificationType: createNotificationDto.notificationType,
      isGlobal: false,
      dedupKey: null,
      target: createNotificationDto.target || {},
      tags: createNotificationDto.tags || [],
      attrs: createNotificationDto.attrs || {},
      readedAt: null,
    });

    return await this.notificationRepository.save(notification);
  }

  async createSystemNotification(dto: CreateSystemNotificationRequestDto) {
    const existing = await this.notificationRepository.findOne({
      where: { dedupKey: dto.dedupKey },
    });
    if (existing) {
      return existing;
    }

    const notification = this.notificationRepository.create({
      userId: null,
      namespaceId: null,
      title: dto.title,
      summary: dto.summary,
      content: dto.content,
      status: NotificationStatus.UNREAD,
      notificationType: 'system',
      isGlobal: true,
      dedupKey: dto.dedupKey,
      target: {},
      tags: ['system'],
      attrs: dto.attrs || {},
      readedAt: null,
    });

    try {
      return await this.notificationRepository.save(notification);
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as QueryFailedError & { driverError?: { code?: string } })
          .driverError?.code === '23505'
      ) {
        return await this.notificationRepository.findOneByOrFail({
          dedupKey: dto.dedupKey,
        });
      }
      throw error;
    }
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

    const queryBuilder = this.createVisibleQuery(userId, namespaceId);

    this.applyStatusFilter(queryBuilder, status);

    if (tagList && tagList.length > 0) {
      queryBuilder.andWhere('notification.tags && :tags', {
        tags: tagList,
      });
    }

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
    const queryBuilder = this.createVisibleQuery(userId, namespaceId);
    this.applyStatusFilter(queryBuilder, NotificationStatus.UNREAD);
    const unreadCount = await queryBuilder.getCount();

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

    const readedAt = notification.isGlobal
      ? notification.userRead?.readAt || new Date()
      : notification.readedAt || new Date();

    if (notification.isGlobal) {
      if (!notification.userRead) {
        await this.notificationReadRepository
          .createQueryBuilder()
          .insert()
          .values({
            notificationId: notification.id,
            userId,
            readAt: readedAt,
          })
          .orIgnore()
          .execute();
      }
      const receipt = await this.notificationReadRepository.findOneByOrFail({
        notificationId: notification.id,
        userId,
      });
      return {
        id: notification.id,
        status: NotificationStatus.READ,
        readed_at: receipt.readAt.toISOString(),
      };
    }

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

    const queryBuilder = this.createVisibleQuery(userId, namespaceId);
    this.applyStatusFilter(queryBuilder, NotificationStatus.UNREAD);
    if (clearNotifications.ids && clearNotifications.ids.length > 0) {
      queryBuilder.andWhere('notification.id IN (:...ids)', {
        ids: clearNotifications.ids,
      });
    }
    const notifications = await queryBuilder.getMany();

    if (notifications.length === 0) {
      return {
        readed_count: 0,
      };
    }

    const readedAt = new Date();
    const globalNotifications = notifications.filter(
      (notification) => notification.isGlobal,
    );
    const directNotifications = notifications.filter(
      (notification) => !notification.isGlobal,
    );

    if (globalNotifications.length > 0) {
      await this.notificationReadRepository.upsert(
        globalNotifications.map((notification) => ({
          notificationId: notification.id,
          userId,
          readAt: readedAt,
        })),
        ['notificationId', 'userId'],
      );
    }

    if (directNotifications.length > 0) {
      await this.notificationRepository.save(
        directNotifications.map((notification) => ({
          ...notification,
          status: NotificationStatus.READ,
          readedAt,
        })),
      );
    }

    return {
      readed_count: notifications.length,
    };
  }

  private createVisibleQuery(
    userId: string,
    namespaceId?: string,
  ): SelectQueryBuilder<Notification> {
    const queryBuilder = this.notificationRepository
      .createQueryBuilder('notification')
      .leftJoinAndMapOne(
        'notification.userRead',
        NotificationRead,
        'notificationRead',
        'notificationRead.notification_id = notification.id AND notificationRead.user_id = :userId',
        { userId },
      )
      .where(
        new Brackets((visibility) => {
          visibility.where('notification.is_global = true');
          if (namespaceId) {
            visibility
              .orWhere(
                'notification.user_id IS NULL AND notification.namespace_id = :namespaceId',
                { namespaceId },
              )
              .orWhere(
                'notification.user_id = :userId AND notification.namespace_id IS NULL',
                { userId },
              )
              .orWhere(
                'notification.user_id = :userId AND notification.namespace_id = :namespaceId',
                { userId, namespaceId },
              );
          } else {
            visibility.orWhere(
              'notification.user_id = :userId AND notification.namespace_id IS NULL',
              { userId },
            );
          }
        }),
      )
      .andWhere('notification.created_at >= :retainedAfter', {
        retainedAfter: this.getRetainedAfter(),
      });

    return queryBuilder;
  }

  private applyStatusFilter(
    queryBuilder: SelectQueryBuilder<Notification>,
    status: string,
  ) {
    if (status === 'all') {
      return;
    }

    queryBuilder.andWhere(
      new Brackets((statusQuery) => {
        if (status === 'unread') {
          statusQuery
            .where(
              'notification.is_global = true AND notificationRead.id IS NULL',
            )
            .orWhere(
              'notification.is_global = false AND notification.status = :status',
              { status },
            );
        } else {
          statusQuery
            .where(
              'notification.is_global = true AND notificationRead.id IS NOT NULL',
            )
            .orWhere(
              'notification.is_global = false AND notification.status = :status',
              { status },
            );
        }
      }),
    );
  }

  private async findVisibleNotification(
    id: string,
    userId: string,
    namespaceId?: string,
  ): Promise<Notification | null> {
    return await this.createVisibleQuery(userId, namespaceId)
      .andWhere('notification.id = :id', { id })
      .getOne();
  }

  private getRetainedAfter(): Date {
    return new Date(
      Date.now() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
  }
}
