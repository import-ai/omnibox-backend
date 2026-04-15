import {
  Notification,
  NotificationStatus,
} from '../entities/notification.entity';

export class NotificationItemDto {
  id: string;
  title: string;
  summary: string;
  status: string;
  action: NotificationActionResponseDto;
  readAt: string | null;
  tags: string[];
  target: Record<string, any>;
  attrs: Record<string, any>;
  expireAt: string | null;
  createdAt: string;

  static fromEntity(notification: Notification): NotificationItemDto {
    const dto = new NotificationItemDto();
    dto.id = notification.id;
    dto.title = notification.title;
    dto.summary = (notification.content || '').slice(0, 20);
    dto.status = notification.status;
    dto.action = NotificationActionResponseDto.fromEntity(notification);
    dto.readAt = notification.readAt?.toISOString() || null;
    dto.tags = notification.tags || [];
    dto.target = notification.target || {};
    dto.attrs = notification.attrs || {};
    dto.expireAt = new Date(
      notification.updatedAt.getTime() + 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    dto.createdAt = notification.createdAt.toISOString();
    return dto;
  }
}

export class NotificationPaginationDto {
  offset: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export class NotificationListResponseDto {
  list: NotificationItemDto[];
  pagination: NotificationPaginationDto;
}

export class NotificationDetailResponseDto {
  id: string;
  title: string;
  content: string;
  tags: string[];
  status: string;
  action: NotificationActionResponseDto;
  readAt: string | null;
  target: Record<string, any>;
  attrs: Record<string, any>;
  createdAt: string;

  static fromEntity(notification: Notification): NotificationDetailResponseDto {
    const dto = new NotificationDetailResponseDto();
    dto.id = notification.id;
    dto.title = notification.title;
    dto.content = notification.content || '';
    dto.tags = notification.tags || [];
    dto.status = notification.status;
    dto.action = NotificationActionResponseDto.fromEntity(notification);
    dto.readAt = notification.readAt?.toISOString() || null;
    dto.target = notification.target || {};
    dto.attrs = notification.attrs || {};
    dto.createdAt = notification.createdAt.toISOString();
    return dto;
  }
}

export class NotificationUnreadCountResponseDto {
  unreadCount: number;
}

export class UpdateNotificationResponseDto {
  id: string;
  status: string;
  readAt: string;
}

export class ClearNotificationsResponseDto {
  readedCount: number;
}

export class NotificationActionResponseDto {
  notificationType: string;
  targetType: string;
  targetId: string | null;
  targetUrl: string | null;
  targetPayload: Record<string, any>;
  shouldMarkRead: boolean;

  static fromEntity(notification: Notification): NotificationActionResponseDto {
    const dto = new NotificationActionResponseDto();
    const target = notification.target || {};
    const targetPayload = {
      ...(target.payload || {}),
    };

    Object.keys(target).forEach((key) => {
      if (!['type', 'id', 'url', 'payload'].includes(key)) {
        targetPayload[key] = target[key];
      }
    });

    dto.notificationType = notification.notificationType || 'none';
    dto.targetType =
      target.type ||
      (target.task_id
        ? 'parser_task'
        : target.resource_id
          ? 'notification_detail'
          : target.url
            ? 'external_url'
            : 'none');
    dto.targetId = target.id || target.task_id || target.resource_id || null;
    dto.targetUrl = target.url || null;
    dto.targetPayload = targetPayload;
    dto.shouldMarkRead = notification.status === NotificationStatus.UNREAD;
    return dto;
  }
}
