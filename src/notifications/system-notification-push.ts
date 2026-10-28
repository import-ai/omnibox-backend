import { randomUUID } from 'node:crypto';

import { HttpStatus } from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';

const PUSH_CONTENT_LIMIT = 120;

// Finish before omnibox-admin aborts the publish request at 10 seconds.
export const SYSTEM_NOTIFICATION_PUSH_TIMEOUT_MS = 8_000;

// Outlive one broadcast attempt so a live sender is not claimed twice.
// A crashed claim can be taken again after the lease. A failed attempt
// releases its claim immediately.
export const SYSTEM_NOTIFICATION_PUSH_CLAIM_LEASE_SECONDS = 20;

export interface SystemNotificationPushPayload {
  id: string;
  title: string;
  content: string | null;
  tags: string[];
}

export async function broadcastSystemNotification(
  proUrl: string,
  notification: SystemNotificationPushPayload,
): Promise<void> {
  const content = (notification.content || notification.title)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, PUSH_CONTENT_LIMIT);
  const response = await fetch(
    `${proUrl}/internal/api/v1/notification/broadcast`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: notification.title,
        content: content || notification.title,
        extras: {
          notification_id: notification.id,
          notification_type: 'system',
          tags: notification.tags,
        },
      }),
      signal: AbortSignal.timeout(SYSTEM_NOTIFICATION_PUSH_TIMEOUT_MS),
    },
  );
  if (!response.ok) {
    throw new Error(`system notification push failed: ${response.status}`);
  }
}

export function claimSystemNotificationPush(
  query: (sql: string, parameters: unknown[]) => Promise<unknown>,
  notificationId: string,
  claimId: string,
): Promise<boolean> {
  return query(
    `UPDATE notifications
     SET jpush_claim_id = $1, jpush_claimed_at = now()
     WHERE id = $2
       AND jpush_sent_at IS NULL
       AND (
         jpush_claim_id IS NULL
         OR jpush_claimed_at < now() - ($3::int * interval '1 second')
       )
     RETURNING id`,
    [claimId, notificationId, SYSTEM_NOTIFICATION_PUSH_CLAIM_LEASE_SECONDS],
  ).then(systemNotificationPushClaimWon);
}

// TypeORM returns [rows, rowCount] for UPDATE and rows for other statements.
export function systemNotificationPushClaimWon(result: unknown): boolean {
  if (!Array.isArray(result) || result.length === 0) {
    return false;
  }
  const rows: unknown[] = Array.isArray(result[0]) ? result[0] : result;
  return rows.length > 0;
}

export interface SystemNotificationDelivery extends SystemNotificationPushPayload {
  jpushSentAt: Date | null;
  jpushClaimId: string | null;
  jpushClaimedAt: Date | null;
}

export interface SystemNotificationPushStore<
  T extends SystemNotificationDelivery,
> {
  query(sql: string, parameters: unknown[]): Promise<unknown>;
  update(
    criteria: { id: string; jpushClaimId: string },
    values: {
      jpushSentAt?: Date;
      jpushClaimId: null;
      jpushClaimedAt: null;
    },
  ): Promise<unknown>;
  findOneByOrFail(where: { id: string }): Promise<T>;
  recordFailure(error: unknown): void;
}

export async function deliverSystemNotificationPush<
  T extends SystemNotificationDelivery,
>(
  proUrl: string | undefined,
  notification: T,
  store: SystemNotificationPushStore<T>,
): Promise<T> {
  if (notification.jpushSentAt || !proUrl) {
    return notification;
  }

  const claimId = randomUUID();
  const claimed = await claimSystemNotificationPush(
    (sql, parameters) => store.query(sql, parameters),
    notification.id,
    claimId,
  );
  if (!claimed) {
    const current = await store.findOneByOrFail({ id: notification.id });
    if (current.jpushSentAt) {
      return current;
    }
    throw new AppException(
      'System notification push is already in progress',
      'SYSTEM_NOTIFICATION_PUSH_IN_PROGRESS',
      HttpStatus.CONFLICT,
    );
  }

  let sent = false;
  try {
    await broadcastSystemNotification(proUrl, notification);
    sent = true;
    const jpushSentAt = new Date();
    await store.update(
      { id: notification.id, jpushClaimId: claimId },
      { jpushSentAt, jpushClaimId: null, jpushClaimedAt: null },
    );
    return {
      ...notification,
      jpushSentAt,
      jpushClaimId: null,
      jpushClaimedAt: null,
    } as T;
  } catch (error) {
    if (!sent) {
      try {
        await store.update(
          { id: notification.id, jpushClaimId: claimId },
          { jpushClaimId: null, jpushClaimedAt: null },
        );
      } catch (releaseError) {
        store.recordFailure(releaseError);
      }
      store.recordFailure(error);
      throw new AppException(
        'System notification push failed',
        'SYSTEM_NOTIFICATION_PUSH_FAILED',
        HttpStatus.BAD_GATEWAY,
      );
    }
    throw error;
  }
}
