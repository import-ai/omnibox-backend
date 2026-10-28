import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { QueryFailedError, Repository } from 'typeorm';

import {
  Notification,
  NotificationRead,
  NotificationStatus,
} from './entities/notification.entity';
import { NotificationsService } from './notifications.service';
import {
  SYSTEM_NOTIFICATION_PUSH_CLAIM_LEASE_SECONDS,
  SYSTEM_NOTIFICATION_PUSH_TIMEOUT_MS,
} from './system-notification-push';

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
    const repository = repositoryMock();
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    const { service, timeout } = pushingService(repository, fetchMock);

    try {
      await service.createSystemNotification(systemNotificationDto());
      expect(timeout).toHaveBeenCalledWith(SYSTEM_NOTIFICATION_PUSH_TIMEOUT_MS);
      expect(
        SYSTEM_NOTIFICATION_PUSH_CLAIM_LEASE_SECONDS * 1000,
      ).toBeGreaterThan(SYSTEM_NOTIFICATION_PUSH_TIMEOUT_MS);
      expect(repository.query).toHaveBeenCalledWith(
        expect.stringContaining('jpush_sent_at IS NULL'),
        [
          expect.any(String),
          'notification-1',
          SYSTEM_NOTIFICATION_PUSH_CLAIM_LEASE_SECONDS,
        ],
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(repository.update).toHaveBeenCalledWith(
        { id: 'notification-1', jpushClaimId: expect.any(String) },
        expect.objectContaining({
          jpushSentAt: expect.any(Date),
          jpushClaimId: null,
          jpushClaimedAt: null,
        }),
      );
    } finally {
      timeout.mockRestore();
      global.fetch = originalFetch;
    }
  });

  it('retries a failed broadcast when the same dedup key is published again', async () => {
    const repository = repositoryMock();
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    const { service, timeout } = pushingService(repository, fetchMock);

    try {
      await expect(
        service.createSystemNotification(systemNotificationDto()),
      ).rejects.toBeInstanceOf(AppException);
      expect(repository.update).toHaveBeenCalledWith(
        { id: 'notification-1', jpushClaimId: expect.any(String) },
        { jpushClaimId: null, jpushClaimedAt: null },
      );

      repository.findOne.mockResolvedValueOnce(unsentNotification());
      await service.createSystemNotification(systemNotificationDto());
    } finally {
      timeout.mockRestore();
      global.fetch = originalFetch;
    }

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(repository.query).toHaveBeenCalledTimes(2);
    expect(repository.update).toHaveBeenCalledTimes(2);
  });

  it('broadcasts once while another attempt holds the claim', async () => {
    const repository = repositoryMock();
    repository.findOne.mockResolvedValue(unsentNotification());
    let claims = 0;
    repository.query.mockImplementation(() => {
      claims += 1;
      return Promise.resolve(
        claims === 1 ? [[{ id: 'notification-1' }], 1] : [[], 0],
      );
    });
    let releaseBroadcast: (value: {
      ok: boolean;
      status: number;
    }) => void = () => undefined;
    let broadcastStarted: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      broadcastStarted = resolve;
    });
    const fetchMock = jest.fn(
      () =>
        new Promise<{ ok: boolean; status: number }>((resolve) => {
          releaseBroadcast = resolve;
          broadcastStarted();
        }),
    );
    const { service, timeout } = pushingService(repository, fetchMock);

    try {
      const first = service.createSystemNotification(systemNotificationDto());
      await started;
      repository.findOneByOrFail.mockResolvedValue(unsentNotification());
      const duplicate = service.createSystemNotification(
        systemNotificationDto(),
      );
      await expect(duplicate).rejects.toBeInstanceOf(AppException);
      await expect(duplicate).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      releaseBroadcast({ ok: true, status: 200 });
      await first;
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      timeout.mockRestore();
      global.fetch = originalFetch;
    }
  });

  it('returns the notification when another attempt already finished', async () => {
    const repository = repositoryMock();
    repository.findOne.mockResolvedValue(unsentNotification());
    repository.query.mockResolvedValue([[], 0]);
    repository.findOneByOrFail.mockResolvedValue({
      ...unsentNotification(),
      jpushSentAt: new Date('2026-10-28T00:00:00.000Z'),
    });
    const fetchMock = jest.fn();
    const { service, timeout } = pushingService(repository, fetchMock);

    try {
      await expect(
        service.createSystemNotification(systemNotificationDto()),
      ).resolves.toEqual(
        expect.objectContaining({
          id: 'notification-1',
          jpushSentAt: expect.any(Date),
        }),
      );
    } finally {
      timeout.mockRestore();
      global.fetch = originalFetch;
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not broadcast a system notification that was already pushed', async () => {
    const repository = repositoryMock();
    repository.findOne.mockResolvedValue({
      ...unsentNotification(),
      jpushSentAt: new Date('2026-10-28T00:00:00.000Z'),
    });
    const fetchMock = jest.fn();
    const { service, timeout } = pushingService(repository, fetchMock);

    try {
      await service.createSystemNotification(systemNotificationDto());
    } finally {
      timeout.mockRestore();
      global.fetch = originalFetch;
    }

    expect(fetchMock).not.toHaveBeenCalled();
    expect(repository.query).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('retries the broadcast after a concurrent dedup conflict', async () => {
    const repository = repositoryMock();
    repository.save.mockRejectedValue(
      new QueryFailedError('', [], { code: '23505' } as unknown as Error),
    );
    repository.findOneByOrFail.mockResolvedValue(unsentNotification());
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    const { service, timeout } = pushingService(repository, fetchMock);

    try {
      await service.createSystemNotification(systemNotificationDto());
    } finally {
      timeout.mockRestore();
      global.fetch = originalFetch;
    }

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(repository.update).toHaveBeenCalledTimes(1);
  });
});

function systemNotificationDto() {
  return {
    dedupKey: 'dedup-1',
    title: 'Changelog',
    content: 'New version',
    tags: ['changelog'],
  };
}

function unsentNotification() {
  return {
    id: 'notification-1',
    title: 'Changelog',
    content: 'New version',
    tags: ['changelog'],
    jpushSentAt: null,
    jpushClaimId: null,
    jpushClaimedAt: null,
  };
}

function repositoryMock() {
  return {
    findOne: jest.fn().mockResolvedValue(null),
    findOneByOrFail: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn((value) => ({ ...value, id: 'notification-1' })),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    query: jest.fn().mockResolvedValue([[{ id: 'notification-1' }], 1]),
  };
}

const originalFetch = global.fetch;

function pushingService(
  repository: ReturnType<typeof repositoryMock>,
  fetchMock: jest.Mock,
) {
  global.fetch = fetchMock as typeof fetch;
  const timeout = jest
    .spyOn(AbortSignal, 'timeout')
    .mockReturnValue(new AbortController().signal);
  const service = new NotificationsService(
    repository as unknown as Repository<Notification>,
    {} as Repository<NotificationRead>,
    {} as I18nService,
    { get: () => 'http://pro.internal' } as unknown as ConfigService,
  );
  return { service, timeout };
}
