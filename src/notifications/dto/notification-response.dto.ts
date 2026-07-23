import { Notification } from '../entities/notification.entity';

export class NotificationItemDto {
  id: string;
  title: string;
  summary: string;
  status: string;
  notification_type: string;
  readed_at: string | null;
  tags: string[];
  target: Record<string, any>;
  attrs: Record<string, any>;
  created_at: string;

  static fromEntity(notification: Notification): NotificationItemDto {
    const dto = new NotificationItemDto();
    dto.id = notification.id;
    dto.title = notification.title;
    dto.summary = (notification.content || '').slice(0, 128);
    dto.notification_type = notification.notificationType;
    dto.status = notification.isGlobal
      ? notification.userRead
        ? 'read'
        : 'unread'
      : notification.status;
    dto.readed_at = notification.isGlobal
      ? notification.userRead?.readAt.toISOString() || null
      : notification.readedAt?.toISOString() || null;
    dto.tags = notification.tags || [];
    dto.target = notification.target || {};
    dto.attrs = notification.attrs || {};
    dto.created_at = notification.createdAt.toISOString();
    return dto;
  }
}

export class NotificationPaginationDto {
  offset: number;
  limit: number;
  total: number;
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
  notification_type: string;
  readed_at: string | null;
  target: Record<string, any>;
  attrs: Record<string, any>;
  created_at: string;

  static fromEntity(notification: Notification): NotificationDetailResponseDto {
    const dto = new NotificationDetailResponseDto();
    dto.id = notification.id;
    dto.title = notification.title;
    dto.content = notification.content || '';
    dto.tags = notification.tags || [];
    dto.notification_type = notification.notificationType;
    dto.status = notification.isGlobal
      ? notification.userRead
        ? 'read'
        : 'unread'
      : notification.status;
    dto.readed_at = notification.isGlobal
      ? notification.userRead?.readAt.toISOString() || null
      : notification.readedAt?.toISOString() || null;
    dto.target = notification.target || {};
    dto.attrs = notification.attrs || {};
    dto.created_at = notification.createdAt.toISOString();
    return dto;
  }
}

export class NotificationUnreadCountResponseDto {
  unread_count: number;
}

export class UpdateNotificationResponseDto {
  id: string;
  status: string;
  readed_at: string;
}

export class ClearNotificationsResponseDto {
  readed_count: number;
}
