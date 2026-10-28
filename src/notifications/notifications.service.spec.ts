import { ConfigService } from '@nestjs/config';
import { I18nService } from 'nestjs-i18n';
import { Repository } from 'typeorm';

import {
  Notification,
  NotificationRead,
  NotificationStatus,
} from './entities/notification.entity';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  const findAndCount = jest.fn();
  const service = new NotificationsService(
    { findAndCount } as unknown as Repository<Notification>,
    {} as Repository<NotificationRead>,
    {} as I18nService,
    { get: () => undefined } as unknown as ConfigService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists all system notifications without a retention filter', async () => {
    const createdAt = new Date('2026-07-24T03:00:00.000Z');
    findAndCount.mockResolvedValue([
      [
        {
          id: '3f389d7b-c7f9-4e21-856f-d3a3da98f076',
          title: 'System update',
          content: '## New feature',
          tags: ['changelog'],
          status: NotificationStatus.UNREAD,
          createdAt,
        } as Notification,
      ],
      1,
    ]);

    await expect(
      service.listSystemNotifications({ offset: 20, limit: 10 }),
    ).resolves.toEqual({
      list: [
        {
          id: '3f389d7b-c7f9-4e21-856f-d3a3da98f076',
          title: 'System update',
          content: '## New feature',
          tags: ['changelog'],
          created_at: createdAt.toISOString(),
        },
      ],
      pagination: { offset: 20, limit: 10, total: 1 },
    });
    expect(findAndCount).toHaveBeenCalledWith({
      where: { isGlobal: true, notificationType: 'system' },
      order: { createdAt: 'DESC' },
      skip: 20,
      take: 10,
    });
  });

  it('broadcasts a new system notification through JPush', async () => {
    const findOne = jest.fn().mockResolvedValue(null);
    const create = jest.fn((value) => value);
    const save = jest.fn(async (value) => ({ ...value, id: 'notification-1' }));
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    const originalFetch = global.fetch;
    global.fetch = fetchMock as typeof fetch;
    const pushingService = new NotificationsService(
      { findOne, create, save } as unknown as Repository<Notification>,
      {} as Repository<NotificationRead>,
      {} as I18nService,
      { get: () => 'http://pro.internal' } as unknown as ConfigService,
    );

    try {
      await pushingService.createSystemNotification({
        dedupKey: 'dedup-1',
        title: '更新日志',
        content: '新版本',
        tags: ['changelog'],
      });
    } finally {
      global.fetch = originalFetch;
    }

    expect(fetchMock).toHaveBeenCalledWith(
      'http://pro.internal/internal/api/v1/notification/broadcast',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
