const PUSH_CONTENT_LIMIT = 120;

// Finish before omnibox-admin aborts the publish request at 10 seconds.
export const SYSTEM_NOTIFICATION_PUSH_TIMEOUT_MS = 8_000;

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
